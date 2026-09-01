import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, NgZone, signal } from '@angular/core';
import { MarketplaceLeadDbSyncService } from '../../core/services/leads/marketplace-lead-db-sync.service';
import { defer, Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  extractLeadsArrayFromApiResponse,
  getIndiaMartCrmPullErrorMessage,
  mapUnknownRecordToIndiaMartLeadInput,
  mapUnknownWebhookPayloadToInput,
} from './indiamart-api.mapper';
import {
  IndiaMartLead,
  IndiaMartLeadInput,
  IndiaMartLeadStatus,
  IndiamartPullResult,
  isIndiaMartLeadStatus,
} from './indiamart-lead.model';

const STORAGE_KEY = 'crm_indiamart_leads_v1';

@Injectable({ providedIn: 'root' })
export class IndiamartLeadsService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly marketplaceDb = inject(MarketplaceLeadDbSyncService);

  private readonly leadsSignal = signal<IndiaMartLead[]>([]);
  private readonly pullInProgressSignal = signal(false);
  private readonly pushInProgressSignal = signal(false);

  readonly leads = this.leadsSignal.asReadonly();
  readonly pullInProgress = this.pullInProgressSignal.asReadonly();
  readonly pushInProgress = this.pushInProgressSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  getLeads(): IndiaMartLead[] {
    return this.leadsSignal();
  }

  /** `null` when live pull can run; otherwise a short fix instruction for the UI. */
  getLivePullConfigurationError(): string | null {
    const pullUrl = environment.indiamart.pullApiUrl.trim();
    if (!pullUrl.length) {
      return 'Set INDIAMART_PULL_API_URL in Frontend/.env (e.g. /indiamart-mapi/wservce/crm/crmListing/v2), then restart ng serve.';
    }
    const key = environment.indiamart.apiKey.trim();
    const urlHasKey = pullUrl.includes('glusr_crm_key=');
    if (!key.length && !urlHasKey) {
      return 'IndiaMART CRM key missing. Add INDIAMART_CRM_KEY=your_glusr_crm_key to Frontend/.env (seller.indiamart.com → Lead Manager → Import/Export → Pull API), then restart ng serve.';
    }
    return null;
  }

  /**
   * Adds a lead when new; if a duplicate exists (same external ref or natural key), returns the existing row.
   */
  addLead(input: IndiaMartLeadInput): IndiaMartLead {
    const dup = this.findDuplicateForInput(input);
    if (dup) return dup;
    const lead = this.normalizeInput(input);
    this.leadsSignal.update((rows) => [lead, ...rows]);
    this.persist();
    this.persistNewLeadsToDb([lead]);
    return lead;
  }

  updateLeadStatus(id: number, status: IndiaMartLeadStatus): void {
    this.leadsSignal.update((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    this.persist();
  }

  deleteLead(id: number): void {
    this.leadsSignal.update((rows) => rows.filter((r) => r.id !== id));
    this.persist();
  }

  clearAllLeads(): void {
    this.leadsSignal.set([]);
    this.persist();
  }

  /**
   * GET {@link environment.indiamart.pullApiUrl} and merge into the local list (deduped).
   */
  fetchFromIndiaMartAPI(): Observable<IndiamartPullResult> {
    const configErr = this.getLivePullConfigurationError();
    if (configErr) {
      return throwError(() => new Error(configErr));
    }
    const url = this.buildCrmPullRequestUrl();
    if (!url.length) {
      return throwError(
        () =>
          new Error(
            'Configure indiamart.pullApiUrl (Lead Manager Pull API, e.g. …/wservce/crm/crmListing/v2) and indiamart.apiKey (glusr_crm_key from seller.indiamart.com).',
          ),
      );
    }

    return defer(() => {
      this.pullInProgressSignal.set(true);
      return this.http.get<unknown>(url, { headers: this.buildJsonAuthHeaders('pull') });
    }).pipe(
      switchMap((body) => {
        const apiErr = getIndiaMartCrmPullErrorMessage(body);
        if (apiErr) {
          throw new Error(apiErr);
        }
        const merged = this.mergeRemoteLeadsFromResponseBody(body);
        return this.attachDbPersistResult(merged);
      }),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          console.warn('[IndiaMART] pull HTTP error', {
            status: err.status,
            statusText: err.statusText,
          });
          return throwError(() => new Error(this.mapHttpError(err)));
        }
        if (err instanceof Error) {
          return throwError(() => err);
        }
        console.warn('[IndiaMART] pull failed', err);
        return throwError(() => new Error('IndiaMART pull failed.'));
      }),
      finalize(() => this.pullInProgressSignal.set(false)),
    );
  }

  /**
   * Verifies optional `webhookToken` when set, maps payload, dedupes, then persists.
   * Intended for future webhook routes or middleware passing `requestToken` from a header.
   */
  handleWebhookLead(payload: unknown, requestToken?: string | null): IndiaMartLead | null {
    const expected = environment.indiamart.webhookToken.trim();
    if (expected.length > 0) {
      const got = requestToken?.trim() ?? '';
      if (got !== expected) {
        return null;
      }
    }
    const input = mapUnknownWebhookPayloadToInput(payload);
    if (!input) {
      return null;
    }
    return this.addLead(input);
  }

  /**
   * POST current IndiaMART rows to {@link environment.indiamart.pushApiUrl} (API contract may evolve).
   */
  syncPendingLeads(): Observable<void> {
    const url = this.browserSafeIndiamartUrl(environment.indiamart.pushApiUrl);
    if (!url.length) {
      return throwError(() => new Error('IndiaMART push URL is not configured.'));
    }

    return defer(() => {
      this.pushInProgressSignal.set(true);
      const snapshot = this.leadsSignal();
      return this.http.post(url, { leads: snapshot }, { headers: this.buildJsonAuthHeaders('push') });
    }).pipe(
      map(() => undefined),
      catchError((err: unknown) => {
        const msg = err instanceof HttpErrorResponse ? this.mapHttpError(err) : 'Network error.';
        return throwError(() => new Error(msg));
      }),
      finalize(() => this.pushInProgressSignal.set(false)),
    );
  }

  /**
   * Fixes common copy-paste errors: `/indiamart mapi/` breaks the dev proxy (must be `/indiamart-mapi/`).
   */
  private resolveIndiamartUrl(raw: string): string {
    let u = raw.trim().replace(/[\r\n]+/g, '');
    u = u.replace(/\/indiamart\s+mapi(\/|$)/gi, '/indiamart-mapi$1');
    u = u.replace(/\/indiamart_mapi(\/|$)/gi, '/indiamart-mapi$1');
    return u;
  }

  /**
   * `mapi.indiamart.com` does not allow browser CORS. Rewrite that origin to
   * same-origin `/indiamart-mapi/...` so reverse proxy (`proxy.conf.json` in dev, Nginx in prod)
   * forwards the request server-to-server.
   */
  private browserSafeIndiamartUrl(raw: string): string {
    const u = this.resolveIndiamartUrl(raw);
    if (!u.length) return u;
    const origin = 'https://mapi.indiamart.com';
    if (u.startsWith(`${origin}/`)) {
      return `/indiamart-mapi${u.slice(origin.length)}`;
    }
    return u;
  }

  /**
   * Official Lead Manager Pull API is only `…/wservce/crm/crmListing/v2?glusr_crm_key=…`.
   * Legacy `…/enquiry/listing/GLUSR_MOBILE/…` URLs return 404/503 — coerce to the CRM path.
   */
  private coerceToLeadManagerPullBase(browserSafe: string): string {
    const q = browserSafe.indexOf('?');
    const pathOnly = q >= 0 ? browserSafe.slice(0, q) : browserSafe;
    const query = q >= 0 ? browserSafe.slice(q) : '';

    const path = pathOnly.replace(/\/wservice\/crm\//gi, '/wservce/crm/');
    const isOfficial = path.includes('/crm/crmListing/v2');

    if (isOfficial) {
      return path + query;
    }

    return '/indiamart-mapi/wservce/crm/crmListing/v2';
  }

  /**
   * Official Lead Manager Pull API: `glusr_crm_key`, `start_time`, `end_time` (IST, DD-MMM-YYYYHH:MM:SS).
   * Each sync requests leads for today 00:00:00–23:59:59 IST.
   */
  private buildCrmPullRequestUrl(): string {
    const safe = this.browserSafeIndiamartUrl(environment.indiamart.pullApiUrl);
    if (!safe.length) return '';
    const base = this.coerceToLeadManagerPullBase(safe);
    const qIdx = base.indexOf('?');
    const pathOnly = qIdx >= 0 ? base.slice(0, qIdx) : base;
    const params = new URLSearchParams(qIdx >= 0 ? base.slice(qIdx + 1) : '');

    if (!params.has('glusr_crm_key')) {
      const key = environment.indiamart.apiKey.trim();
      if (!key.length) {
        return '';
      }
      params.set('glusr_crm_key', key);
    }

    const { start_time, end_time } = this.getTodayIstPullTimeRange();
    params.set('start_time', start_time);
    params.set('end_time', end_time);

    return `${pathOnly}?${params.toString()}`;
  }

  /** IndiaMART Pull API expects IST timestamps like `18-May-202600:00:00`. */
  private getTodayIstPullTimeRange(): { start_time: string; end_time: string } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).formatToParts(new Date());
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    const month = parts.find((p) => p.type === 'month')?.value ?? 'Jan';
    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    return {
      start_time: `${day}-${month}-${year}00:00:00`,
      end_time: `${day}-${month}-${year}23:59:59`,
    };
  }

  /**
   * Pull API authenticates via `glusr_crm_key` in the URL only. Push may use Bearer when configured.
   */
  private buildJsonAuthHeaders(context: 'pull' | 'push'): HttpHeaders {
    const headers = new HttpHeaders({ Accept: 'application/json' });
    if (context === 'pull') {
      return headers;
    }
    const key = environment.indiamart.apiKey.trim();
    if (key.length > 0) {
      return headers.set('Authorization', `Bearer ${key}`);
    }
    return headers;
  }

  private mapHttpError(err: HttpErrorResponse): string {
    if (err.status === 0) {
      if (!environment.production) {
        return 'Cannot reach IndiaMART (network or CORS). Use a `/indiamart-mapi/...` URL with `ng serve` + proxy, or paste `https://mapi.indiamart.com/...` — it is rewritten to the proxy automatically in dev.';
      }
      return 'Cannot reach IndiaMART service. Use a server or reverse proxy; browsers block cross-origin calls.';
    }
    if (err.status === 401 || err.status === 403) {
      return 'IndiaMART request was not authorized.';
    }
    if (err.status === 404) {
      return 'IndiaMART endpoint was not found. Use Lead Manager Pull API path …/wservce/crm/crmListing/v2 (not enquiry/GLUSR_MOBILE).';
    }
    if (err.status === 503) {
      return 'IndiaMART returned 503 (service unavailable). Often caused by an outdated URL (use …/crm/crmListing/v2), rate limits (max once per 5 minutes), or temporary outage.';
    }
    if (err.status >= 500) {
      return 'IndiaMART service returned a server error.';
    }
    if (typeof err.error === 'string' && err.error.trim().length > 0 && err.error.length < 600) {
      return err.error.trim();
    }
    if (err.error && typeof err.error === 'object') {
      const e = err.error as Record<string, unknown>;
      const imMsg = e['MESSAGE'];
      if (typeof imMsg === 'string' && imMsg.length > 0 && imMsg.length < 600) {
        return imMsg;
      }
      const m = e['message'];
      if (typeof m === 'string' && m.length > 0 && m.length < 200) {
        return m;
      }
    }
    return 'IndiaMART request failed.';
  }

  private mergeRemoteLeadsFromResponseBody(body: unknown): IndiamartPullResult {
    const rawList = extractLeadsArrayFromApiResponse(body);
    const bodyTag = Array.isArray(body) ? 'array' : body === null ? 'null' : typeof body;
    const first = rawList[0];
    const firstKeys =
      first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as object).slice(0, 20)
        : [];

    console.log('[IndiaMART] API body (parsed)', {
      bodyTag,
      rawItemsInResponse: rawList.length,
      firstItemKeys: firstKeys,
    });

    if (rawList.length === 0) {
      console.log('[IndiaMART] no lead array extracted — check response shape (data/leads/items) or empty API list.');
      return { added: 0, skippedDuplicates: 0, remoteCount: 0 };
    }

    const inputs: IndiaMartLeadInput[] = [];
    for (const item of rawList) {
      const mapped = mapUnknownRecordToIndiaMartLeadInput(item);
      if (mapped) inputs.push(mapped);
    }

    const parseDropped = rawList.length - inputs.length;
    if (parseDropped > 0) {
      console.log('[IndiaMART] mapper skipped items (missing name/email/mobile)', {
        rawItemsInResponse: rawList.length,
        mappedOk: inputs.length,
        skipped: parseDropped,
      });
    }

    const seenIncoming = new Set<string>();
    let added = 0;
    let skippedDuplicates = 0;
    const newLeads: IndiaMartLead[] = [];
    const existingKeys = new Set(this.leadsSignal().map((r) => this.naturalDedupeKeyFromStored(r)));
    let nextGeneratedId = this.nextId();

    for (const input of inputs) {
      const k = this.naturalDedupeKeyFromInput(input);
      if (seenIncoming.has(k)) {
        skippedDuplicates++;
        continue;
      }
      seenIncoming.add(k);
      if (existingKeys.has(k)) {
        skippedDuplicates++;
        continue;
      }
      const lead = this.normalizeInput(input, input.id ?? nextGeneratedId);
      if (input.id == null) {
        nextGeneratedId = Math.max(nextGeneratedId + 1, lead.id + 1);
      }
      existingKeys.add(k);
      newLeads.push(lead);
      added++;
    }

    if (newLeads.length > 0) {
      this.leadsSignal.update((rows) => [...newLeads, ...rows]);
      this.persist();
    }

    const totalNow = this.leadsSignal().length;
    const preview = this.leadsSignal().slice(0, 8).map((l) => ({
      id: l.id,
      customerName: l.customerName,
      product: l.product,
      city: l.city,
      status: l.status,
    }));

    console.log('[IndiaMART] pull merge result', {
      added,
      skippedDuplicates,
      remoteCountMapped: inputs.length,
      totalLeadsInCache: totalNow,
      newestPreview: preview,
    });

    return {
      added,
      skippedDuplicates,
      remoteCount: inputs.length,
      newLeads,
    };
  }

  private persistNewLeadsToDb(leads: IndiaMartLead[]): void {
    if (leads.length === 0 || !this.marketplaceDb.enabled()) return;
    this.marketplaceDb
      .persistIndiaMartLeads(leads)
      .pipe(
        catchError((err) => {
          console.warn('[IndiaMART] DB persist failed', err);
          return of({ saved: 0, skipped: 0, failed: leads.length });
        }),
      )
      .subscribe();
  }

  private attachDbPersistResult(merged: IndiamartPullResult): Observable<IndiamartPullResult> {
    const batch = merged.newLeads ?? [];
    if (batch.length === 0 || !this.marketplaceDb.enabled()) {
      return of(merged);
    }
    return this.marketplaceDb.persistIndiaMartLeads(batch).pipe(
      map((db) => ({
        ...merged,
        dbSaved: db.saved,
        dbSkipped: db.skipped,
        dbFailed: db.failed,
        lastError: db.lastError,
      })),
      catchError((err) => {
        console.warn('[IndiaMART] DB persist failed', err);
        return of(merged);
      }),
    );
  }

  private findDuplicateForInput(input: IndiaMartLeadInput): IndiaMartLead | null {
    const k = this.naturalDedupeKeyFromInput(input);
    for (const r of this.leadsSignal()) {
      if (this.naturalDedupeKeyFromStored(r) === k) return r;
    }
    return null;
  }

  private naturalDedupeKeyFromInput(input: IndiaMartLeadInput): string {
    const ref = input.externalRef?.trim();
    if (ref) return `ref:${ref}`;
    const e = input.email.trim().toLowerCase();
    const m = input.mobile.trim();
    const p = input.product.trim().toLowerCase();
    return `nat:${e}|${m}|${p}`;
  }

  private naturalDedupeKeyFromStored(lead: IndiaMartLead): string {
    const ref = lead.externalRef?.trim();
    if (ref) return `ref:${ref}`;
    const e = lead.email.trim().toLowerCase();
    const m = lead.mobile.trim();
    const p = lead.product.trim().toLowerCase();
    return `nat:${e}|${m}|${p}`;
  }

  private hydrateFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const rows = parsed.filter(this.isValidLead) as IndiaMartLead[];
      const repairedRows = this.ensureUniqueStoredIds(rows);
      this.leadsSignal.set(repairedRows);
      if (repairedRows.some((row, i) => row.id !== rows[i].id)) {
        this.persist();
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private persist(): void {
    try {
      const payload = JSON.stringify(this.leadsSignal());
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      /* quota / private mode */
    }
  }

  private normalizeInput(input: IndiaMartLeadInput, idOverride?: number): IndiaMartLead {
    const id = input.id ?? idOverride ?? this.nextId();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const lead: IndiaMartLead = {
      id,
      customerName: input.customerName.trim(),
      mobile: input.mobile.trim(),
      email: input.email.trim(),
      city: input.city.trim(),
      product: input.product.trim(),
      quantity: input.quantity.trim(),
      message: input.message.trim(),
      source: input.source.trim(),
      status: input.status,
      createdAt,
    };
    const ref = input.externalRef?.trim();
    if (ref) lead.externalRef = ref;
    return lead;
  }

  private nextId(): number {
    const rows = this.leadsSignal();
    const max = rows.reduce((m, r) => Math.max(m, r.id), 0);
    return Math.max(max + 1, Date.now());
  }

  private ensureUniqueStoredIds(rows: readonly IndiaMartLead[]): IndiaMartLead[] {
    const used = new Set<number>();
    let next = Math.max(
      Date.now(),
      rows.reduce((max, row) => Math.max(max, row.id), 0) + 1,
    );

    return rows.map((row) => {
      if (!used.has(row.id)) {
        used.add(row.id);
        return row;
      }
      while (used.has(next)) {
        next++;
      }
      const repaired = { ...row, id: next };
      used.add(repaired.id);
      next++;
      return repaired;
    });
  }

  private isValidLead(value: unknown): value is IndiaMartLead {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    if (v['externalRef'] !== undefined && typeof v['externalRef'] !== 'string') return false;
    return (
      typeof v['id'] === 'number' &&
      typeof v['customerName'] === 'string' &&
      typeof v['mobile'] === 'string' &&
      typeof v['email'] === 'string' &&
      typeof v['city'] === 'string' &&
      typeof v['product'] === 'string' &&
      typeof v['quantity'] === 'string' &&
      typeof v['message'] === 'string' &&
      typeof v['source'] === 'string' &&
      typeof v['status'] === 'string' &&
      isIndiaMartLeadStatus(v['status'] as string) &&
      typeof v['createdAt'] === 'string'
    );
  }
}

/** Optional: shared counts for dashboard cards (kept next to service for discoverability). */
export function indiamartLeadCounts(leads: readonly IndiaMartLead[]) {
  const base: Record<IndiaMartLeadStatus | 'all', number> = {
    all: leads.length,
    New: 0,
    Contacted: 0,
    Qualified: 0,
    Converted: 0,
  };
  for (const l of leads) {
    base[l.status]++;
  }
  return base;
}

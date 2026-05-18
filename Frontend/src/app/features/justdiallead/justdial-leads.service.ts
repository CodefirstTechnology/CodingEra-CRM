import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { MarketplaceLeadDbSyncService } from '../../core/services/leads/marketplace-lead-db-sync.service';
import { defer, Observable, of, throwError } from 'rxjs';
import { catchError, delay, finalize, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import mockJustdialApiResponse from './justdial-mock-response.json';
import {
  extractJustdialLeadsArrayFromApiResponse,
  mapUnknownJustdialWebhookPayloadToInput,
  mapUnknownRecordToJustdialLeadInput,
} from './justdial-api.mapper';
import {
  isJustdialLeadStatus,
  JustdialLead,
  JustdialLeadInput,
  JustdialLeadStatus,
  JustdialPullResult,
} from './justdial-lead.model';

const STORAGE_KEY = 'crm_justdial_leads_v1';
const MOCK_PULL_DELAY_MS = 700;

@Injectable({ providedIn: 'root' })
export class JustdialLeadsService {
  private readonly http = inject(HttpClient);
  private readonly marketplaceDb = inject(MarketplaceLeadDbSyncService);

  private readonly leadsSignal = signal<JustdialLead[]>([]);
  private readonly loadingSignal = signal(false);

  readonly leads = this.leadsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  getLeads(): JustdialLead[] {
    return this.leadsSignal();
  }

  getStoredLeads(): JustdialLead[] {
    return [...this.leadsSignal()];
  }

  saveLeads(leads: readonly JustdialLead[] = this.leadsSignal()): void {
    this.leadsSignal.set([...leads]);
    this.persist();
  }

  clearLeads(): void {
    this.leadsSignal.set([]);
    this.persist();
  }

  /**
   * Adds a lead when new; if a duplicate exists (same external ref or natural key), returns the existing row.
   */
  addLead(input: JustdialLeadInput): JustdialLead {
    const dup = this.findDuplicateForInput(input);
    if (dup) return dup;
    const lead = this.normalizeInput(input);
    this.leadsSignal.update((rows) => [lead, ...rows]);
    this.persist();
    this.persistNewLeadsToDb([lead]);
    return lead;
  }

  updateLeadStatus(id: number, status: JustdialLeadStatus): void {
    this.leadsSignal.update((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    this.persist();
  }

  deleteLead(id: number): void {
    this.leadsSignal.update((rows) => rows.filter((r) => r.id !== id));
    this.persist();
  }

  /**
   * Pulls Justdial leads through mock JSON or a backend/proxy URL and merges into localStorage.
   */
  fetchFromAPI(): Observable<JustdialPullResult> {
    if (!environment.justdial.enabled) {
      return throwError(() => new Error('Justdial integration is disabled.'));
    }

    if (environment.justdial.useMock) {
      return defer(() => {
        this.loadingSignal.set(true);
        return of(mockJustdialApiResponse as unknown).pipe(delay(MOCK_PULL_DELAY_MS));
      }).pipe(
        switchMap((body) => this.attachDbPersistResult(this.mergeRemoteLeadsFromResponseBody(body))),
        finalize(() => this.loadingSignal.set(false)),
      );
    }

    const url = environment.justdial.pullApiUrl.trim();
    if (!url.length) {
      return throwError(
        () =>
          new Error(
            'Configure justdial.pullApiUrl to a backend/proxy endpoint before syncing Justdial leads.',
          ),
      );
    }

    return defer(() => {
      this.loadingSignal.set(true);
      return this.http.get<unknown>(url, { headers: this.buildJsonAuthHeaders() });
    }).pipe(
      switchMap((body) => this.attachDbPersistResult(this.mergeRemoteLeadsFromResponseBody(body))),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          console.warn('[Justdial] pull HTTP error', {
            status: err.status,
            statusText: err.statusText,
          });
          return throwError(() => new Error(this.mapHttpError(err)));
        }
        if (err instanceof Error) {
          return throwError(() => err);
        }
        console.warn('[Justdial] pull failed', err);
        return throwError(() => new Error('Justdial sync failed.'));
      }),
      finalize(() => this.loadingSignal.set(false)),
    );
  }

  /**
   * Verifies optional `webhookToken` when set, maps payload, dedupes, then persists.
   * Intended for future backend/proxy webhook routes passing `requestToken` from a header.
   */
  handleWebhookLead(payload: unknown, requestToken?: string | null): JustdialLead | null {
    const expected = environment.justdial.webhookToken.trim();
    if (expected.length > 0) {
      const got = requestToken?.trim() ?? '';
      if (got !== expected) {
        return null;
      }
    }
    const input = mapUnknownJustdialWebhookPayloadToInput(payload);
    if (!input) {
      return null;
    }
    return this.addLead(input);
  }

  mergeDeduplicatedLeads(inputs: readonly JustdialLeadInput[]): JustdialPullResult {
    const seenIncoming = new Set<string>();
    let added = 0;
    let skippedDuplicates = 0;
    const newLeads: JustdialLead[] = [];
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

    return {
      added,
      skippedDuplicates,
      remoteCount: inputs.length,
      newLeads,
    };
  }

  private persistNewLeadsToDb(leads: JustdialLead[]): void {
    if (leads.length === 0 || !this.marketplaceDb.enabled()) return;
    this.marketplaceDb
      .persistJustdialLeads(leads)
      .pipe(
        catchError((err) => {
          console.warn('[Justdial] DB persist failed', err);
          return of({ saved: 0, skipped: 0, failed: leads.length });
        }),
      )
      .subscribe();
  }

  private attachDbPersistResult(merged: JustdialPullResult): Observable<JustdialPullResult> {
    const batch = merged.newLeads ?? [];
    if (batch.length === 0 || !this.marketplaceDb.enabled()) {
      return of(merged);
    }
    return this.marketplaceDb.persistJustdialLeads(batch).pipe(
      map((db) => ({
        ...merged,
        dbSaved: db.saved,
        dbSkipped: db.skipped,
        dbFailed: db.failed,
        lastError: db.lastError,
      })),
      catchError((err) => {
        console.warn('[Justdial] DB persist failed', err);
        return of(merged);
      }),
    );
  }

  private buildJsonAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ Accept: 'application/json' });
    const key = environment.justdial.apiKey.trim();
    if (key.length > 0) {
      headers = headers.set('Authorization', `Bearer ${key}`);
    }
    return headers;
  }

  private mapHttpError(err: HttpErrorResponse): string {
    if (err.status === 0) {
      if (!environment.production) {
        return 'Cannot reach Justdial sync endpoint. Use a same-origin backend/proxy URL while developing.';
      }
      return 'Cannot reach Justdial service. Route production sync through the backend/proxy.';
    }
    if (err.status === 401 || err.status === 403) {
      return 'Justdial request was not authorized.';
    }
    if (err.status === 404) {
      return 'Justdial sync endpoint was not found.';
    }
    if (err.status === 429) {
      return 'Justdial rate limit reached. Please try again later.';
    }
    if (err.status >= 500) {
      return 'Justdial service returned a server error.';
    }
    if (typeof err.error === 'string' && err.error.trim().length > 0 && err.error.length < 600) {
      return err.error.trim();
    }
    if (err.error && typeof err.error === 'object') {
      const e = err.error as Record<string, unknown>;
      const msg = e['message'] ?? e['MESSAGE'] ?? e['error'];
      if (typeof msg === 'string' && msg.length > 0 && msg.length < 600) {
        return msg;
      }
    }
    return 'Justdial sync failed.';
  }

  private mergeRemoteLeadsFromResponseBody(body: unknown): JustdialPullResult {
    const rawList = extractJustdialLeadsArrayFromApiResponse(body);
    const inputs: JustdialLeadInput[] = [];
    for (const item of rawList) {
      const mapped = mapUnknownRecordToJustdialLeadInput(item);
      if (mapped) inputs.push(mapped);
    }

    const parseDropped = rawList.length - inputs.length;
    if (parseDropped > 0) {
      console.log('[Justdial] mapper skipped items (missing name/email/mobile)', {
        rawItemsInResponse: rawList.length,
        mappedOk: inputs.length,
        skipped: parseDropped,
      });
    }

    const result = this.mergeDeduplicatedLeads(inputs);
    console.log('[Justdial] pull merge result', {
      added: result.added,
      skippedDuplicates: result.skippedDuplicates,
      remoteCountMapped: result.remoteCount,
      rawItemsInResponse: rawList.length,
      totalLeadsInCache: this.leadsSignal().length,
    });
    return result;
  }

  private findDuplicateForInput(input: JustdialLeadInput): JustdialLead | null {
    const k = this.naturalDedupeKeyFromInput(input);
    for (const r of this.leadsSignal()) {
      if (this.naturalDedupeKeyFromStored(r) === k) return r;
    }
    return null;
  }

  private naturalDedupeKeyFromInput(input: JustdialLeadInput): string {
    const ref = input.externalRef?.trim();
    if (ref) return `ref:${ref}`;
    const e = input.email.trim().toLowerCase();
    const m = input.mobile.trim();
    const p = input.product.trim().toLowerCase();
    return `nat:${e}|${m}|${p}`;
  }

  private naturalDedupeKeyFromStored(lead: JustdialLead): string {
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
      const rows = parsed.filter(this.isValidLead) as JustdialLead[];
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

  private normalizeInput(input: JustdialLeadInput, idOverride?: number): JustdialLead {
    const id = input.id ?? idOverride ?? this.nextId();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const lead: JustdialLead = {
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

  private ensureUniqueStoredIds(rows: readonly JustdialLead[]): JustdialLead[] {
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

  private isValidLead(value: unknown): value is JustdialLead {
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
      isJustdialLeadStatus(v['status'] as string) &&
      typeof v['createdAt'] === 'string'
    );
  }
}

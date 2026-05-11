import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, NgZone, signal } from '@angular/core';
import { defer, Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
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

/** Seeded + random data for offline simulation (India-focused B2B samples). */
const SAMPLE_FIRST = [
  'Rajesh',
  'Priya',
  'Amit',
  'Sneha',
  'Vikram',
  'Ananya',
  'Karthik',
  'Deepa',
  'Manish',
  'Kavita',
] as const;
const SAMPLE_LAST = [
  'Kumar',
  'Sharma',
  'Patel',
  'Reddy',
  'Iyer',
  'Singh',
  'Mehta',
  'Nair',
  'Joshi',
  'Desai',
] as const;
const SAMPLE_CITIES = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Pune',
  'Ahmedabad',
  'Kolkata',
  'Jaipur',
  'Indore',
] as const;
const SAMPLE_PRODUCTS = [
  'Industrial PVC Pipes',
  'SS Fasteners Grade 304',
  'Centrifugal Water Pump 5HP',
  'Three-phase Induction Motor',
  'Hydraulic Hose Assembly',
  'CNC Lathe Spare Kit',
  'Solar Panel 450W Mono',
  'Warehouse Pallet Rack',
  'Safety Helmets (ISI)',
  'Copper Wire 2.5 sq mm',
] as const;

@Injectable({ providedIn: 'root' })
export class IndiamartLeadsService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);

  private readonly leadsSignal = signal<IndiaMartLead[]>([]);
  private readonly pullInProgressSignal = signal(false);
  private readonly pushInProgressSignal = signal(false);

  readonly leads = this.leadsSignal.asReadonly();
  readonly pullInProgress = this.pullInProgressSignal.asReadonly();
  readonly pushInProgress = this.pushInProgressSignal.asReadonly();

  private simIntervalId: ReturnType<typeof setInterval> | null = null;
  private simStopId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const hadPersistedKey = localStorage.getItem(STORAGE_KEY) !== null;
    this.hydrateFromStorage();
    if (environment.indiamart.useMock && !hadPersistedKey) {
      this.seedDummyLeads();
    }
  }

  getLeads(): IndiaMartLead[] {
    return this.leadsSignal();
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
    return lead;
  }

  /**
   * Starts (or restarts) the demo auto-simulation. Only active when `indiamart.useMock` is true.
   */
  startDemoAutoSimulation(config: {
    intervalMs: number;
    durationMs: number;
    onLeadAdded?: () => void;
    onSessionEnd?: () => void;
  }): void {
    if (!environment.indiamart.useMock) {
      return;
    }
    this.stopDemoAutoSimulation('restart (single session)');
    const { intervalMs, durationMs, onLeadAdded, onSessionEnd } = config;
    if (intervalMs <= 0) {
      return;
    }

    this.simIntervalId = window.setInterval(() => {
      this.zone.run(() => {
        this.addLead(this.buildRandomLead());
        onLeadAdded?.();
      });
    }, intervalMs);

    if (durationMs > 0) {
      this.simStopId = window.setTimeout(() => {
        this.zone.run(() => {
          this.stopDemoAutoSimulation('session duration complete');
          this.clearAllLeads();
          onSessionEnd?.();
        });
      }, durationMs);
    }
  }

  stopDemoAutoSimulation(_reason: string): void {
    if (this.simIntervalId != null) {
      window.clearInterval(this.simIntervalId);
      this.simIntervalId = null;
    }
    if (this.simStopId != null) {
      window.clearTimeout(this.simStopId);
      this.simStopId = null;
    }
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

  seedDummyLeads(): void {
    if (!environment.indiamart.useMock) {
      return;
    }
    const now = Date.now();
    const seeds: IndiaMartLeadInput[] = [
      {
        customerName: 'Ramesh Agarwal',
        mobile: '9876543210',
        email: 'r.agarwal@example.com',
        city: 'Mumbai',
        product: 'SS Ball Valves DN50',
        quantity: '120 pcs',
        message: 'Need quotation for bulk supply to Vasai warehouse.',
        source: 'IndiaMART Inquiry',
        status: 'New',
      },
      {
        customerName: 'Sunita Menon',
        mobile: '9123456789',
        email: 'sunita.m@example.com',
        city: 'Bengaluru',
        product: 'Industrial Conveyor Belt',
        quantity: '80 m',
        message: 'Urgent replacement for food-grade line.',
        source: 'IndiaMART BuyLead',
        status: 'Contacted',
      },
      {
        customerName: 'Harish Khanna',
        mobile: '9988776655',
        email: 'hk.traders@example.com',
        city: 'Delhi',
        product: 'DG Set 125 kVA',
        quantity: '1 unit',
        message: 'Installation required within 2 weeks.',
        source: 'IndiaMART Inquiry',
        status: 'Qualified',
      },
      {
        customerName: 'Meera Joshi',
        mobile: '9090909090',
        email: 'meera.j@example.com',
        city: 'Ahmedabad',
        product: 'Modular Office Furniture',
        quantity: '45 sets',
        message: 'Converted from pilot order — repeat purchase.',
        source: 'IndiaMART BuyLead',
        status: 'Converted',
      },
    ];
    const withIds = seeds.map((row, i) =>
      this.normalizeInput({
        ...row,
        id: now + i,
        createdAt: new Date(now - (i + 1) * 3600_000).toISOString(),
      }),
    );
    this.leadsSignal.update((existing) => [...withIds, ...existing]);
    this.persist();
  }

  buildRandomLead(overrides: Partial<IndiaMartLeadInput> = {}): IndiaMartLeadInput {
    const first = SAMPLE_FIRST[Math.floor(Math.random() * SAMPLE_FIRST.length)];
    const last = SAMPLE_LAST[Math.floor(Math.random() * SAMPLE_LAST.length)];
    const city = SAMPLE_CITIES[Math.floor(Math.random() * SAMPLE_CITIES.length)];
    const product = SAMPLE_PRODUCTS[Math.floor(Math.random() * SAMPLE_PRODUCTS.length)];
    const qty = `${10 + Math.floor(Math.random() * 200)} ${Math.random() > 0.5 ? 'pcs' : 'units'}`;
    return {
      customerName: `${first} ${last}`,
      mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      city,
      product,
      quantity: qty,
      message: `Inquiry via IndiaMART — interested in ${product}. Please share best price and delivery to ${city}.`,
      source: Math.random() > 0.4 ? 'IndiaMART Inquiry' : 'IndiaMART BuyLead',
      status: 'New',
      ...overrides,
    };
  }

  /**
   * GET {@link environment.indiamart.pullApiUrl} and merge into the local list (deduped).
   * No-op in mock mode beyond emitting an error Observable.
   */
  fetchFromIndiaMartAPI(): Observable<IndiamartPullResult> {
    if (environment.indiamart.useMock) {
      return throwError(() => new Error('IndiaMART pull is not available in mock mode.'));
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
      map((body) => {
        const apiErr = getIndiaMartCrmPullErrorMessage(body);
        if (apiErr) {
          throw new Error(apiErr);
        }
        return this.mergeRemoteLeadsFromResponseBody(body);
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
    if (environment.indiamart.useMock) {
      return of(undefined);
    }
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
   * `mapi.indiamart.com` does not allow browser CORS from localhost. In development, rewrite that
   * origin to same-origin `/indiamart-mapi/...` so `ng serve` + `proxy.conf.json` forward the request.
   */
  private browserSafeIndiamartUrl(raw: string): string {
    const u = this.resolveIndiamartUrl(raw);
    if (!u.length) return u;
    if (environment.production) {
      return u;
    }
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

    if (environment.production) {
      return 'https://mapi.indiamart.com/wservce/crm/crmListing/v2';
    }
    return '/indiamart-mapi/wservce/crm/crmListing/v2';
  }

  /**
   * Official Lead Manager Pull API uses query param `glusr_crm_key` (see IndiaMART docs).
   * If `pullApiUrl` already contains `glusr_crm_key=`, it is left unchanged.
   */
  private buildCrmPullRequestUrl(): string {
    const safe = this.browserSafeIndiamartUrl(environment.indiamart.pullApiUrl);
    if (!safe.length) return '';
    const base = this.coerceToLeadManagerPullBase(safe);
    if (base.includes('glusr_crm_key=')) {
      return base;
    }
    const key = environment.indiamart.apiKey.trim();
    if (!key.length) {
      return '';
    }
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}glusr_crm_key=${encodeURIComponent(key)}`;
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
      const lead = this.normalizeInput(input);
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
    };
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
      this.leadsSignal.set(rows);
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

  private normalizeInput(input: IndiaMartLeadInput): IndiaMartLead {
    const id = input.id ?? this.nextId();
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

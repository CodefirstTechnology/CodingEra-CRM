import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  IndiaMartLead,
  IndiaMartLeadInput,
  IndiaMartLeadStatus,
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
  /** In-memory + persisted lead list. */
  private readonly leadsSignal = signal<IndiaMartLead[]>([]);

  /** Public read-only view for templates / computed pipelines. */
  readonly leads = this.leadsSignal.asReadonly();

  constructor() {
    const hadPersistedKey = localStorage.getItem(STORAGE_KEY) !== null;
    this.hydrateFromStorage();
    /** Seed only when storage was never written — empty `[]` after user deletes all must stay empty. */
    if (!hadPersistedKey) {
      this.seedDummyLeads();
    }
  }

  /** Returns the current snapshot (synchronous local cache). */
  getLeads(): IndiaMartLead[] {
    return this.leadsSignal();
  }

  /** Adds a lead, persists to localStorage, prepends to the list. */
  addLead(input: IndiaMartLeadInput): IndiaMartLead {
    const lead = this.normalizeInput(input);
    this.leadsSignal.update((rows) => [lead, ...rows]);
    this.persist();
    return lead;
  }

  updateLeadStatus(id: number, status: IndiaMartLeadStatus): void {
    this.leadsSignal.update((rows) =>
      rows.map((r) => (r.id === id ? { ...r, status } : r)),
    );
    this.persist();
  }

  deleteLead(id: number): void {
    this.leadsSignal.update((rows) => rows.filter((r) => r.id !== id));
    this.persist();
  }

  /**
   * Inserts a representative batch so the dashboard is usable before any API exists.
   * Safe to call manually; normally runs once when storage is empty.
   */
  seedDummyLeads(): void {
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

  /** Builds a random IndiaMART-style lead for demos and interval simulation. */
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

  // —— Future backend integration (replace bodies; keep method names for callers) ——

  /**
   * Pull leads from IndiaMART Lead API (REST). Wire HttpClient + auth headers here.
   * Merge into `leadsSignal`, dedupe by external id when the API provides one.
   */
  fetchFromIndiaMartAPI(): Observable<IndiaMartLead[]> {
    // Example: return this.http.get<IndiaMartLeadDto[]>(environment.indiamartLeadUrl).pipe(...)
    return of([]);
  }

  /**
   * Normalize webhook POST body from IndiaMART (signature verify, map fields, then `addLead`).
   */
  handleWebhookLead(payload: unknown): IndiaMartLead | null {
    // Example: const dto = payload as IndiaMartWebhookDto; return this.addLead(mapWebhook(dto));
    void payload;
    return null;
  }

  /** Push locally queued changes or fetch delta when offline sync is required. */
  syncPendingLeads(): Observable<void> {
    // Example: batch POST unsynced rows, then clear pending flags in storage.
    return of(undefined);
  }

  // —— Private helpers ——

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.leadsSignal()));
    } catch {
      /* quota / private mode */
    }
  }

  private normalizeInput(input: IndiaMartLeadInput): IndiaMartLead {
    const id = input.id ?? this.nextId();
    const createdAt = input.createdAt ?? new Date().toISOString();
    return {
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
  }

  private nextId(): number {
    const rows = this.leadsSignal();
    const max = rows.reduce((m, r) => Math.max(m, r.id), 0);
    return Math.max(max + 1, Date.now());
  }

  private isValidLead(value: unknown): value is IndiaMartLead {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
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

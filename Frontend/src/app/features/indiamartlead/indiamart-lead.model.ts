/** IndiaMART-sourced lead pipeline status (UI + localStorage). */
export type IndiaMartLeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Converted';

export const INDIA_MART_LEAD_STATUSES: readonly IndiaMartLeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Converted',
] as const;

export function isIndiaMartLeadStatus(value: string): value is IndiaMartLeadStatus {
  return (INDIA_MART_LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Normalized IndiaMART lead row used by the CRM UI.
 * Shape is chosen to map cleanly to IndiaMART Lead API / webhook payloads later.
 */
export interface IndiaMartLead {
  id: number;
  /** Stable id from IndiaMART / middleware for deduplication when pulling from API. */
  externalRef?: string;
  customerName: string;
  mobile: string;
  email: string;
  city: string;
  product: string;
  quantity: string;
  message: string;
  source: string;
  status: IndiaMartLeadStatus;
  createdAt: string;
}

/** DTO for creating or simulating a lead (server assigns id/timestamps in production). */
export type IndiaMartLeadInput = Omit<IndiaMartLead, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};

/** Result of merging a pull response into the local IndiaMART cache. */
export interface IndiamartPullResult {
  added: number;
  skippedDuplicates: number;
  remoteCount: number;
  /** Rows added to localStorage on this pull (for DB sync). */
  newLeads?: IndiaMartLead[];
  dbSaved?: number;
  dbSkipped?: number;
  dbFailed?: number;
  lastError?: string;
}

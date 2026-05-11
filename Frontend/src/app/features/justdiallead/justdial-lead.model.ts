/** Justdial-sourced lead pipeline status (UI + localStorage). */
export type JustdialLeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Converted';

export const JUSTDIAL_LEAD_STATUSES: readonly JustdialLeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Converted',
] as const;

export function isJustdialLeadStatus(value: string): value is JustdialLeadStatus {
  return (JUSTDIAL_LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Normalized Justdial lead row used by the CRM UI.
 * Kept frontend-local until the backend/proxy contract is available.
 */
export interface JustdialLead {
  id: number;
  /** Stable id from Justdial / middleware for deduplication when pulling from API. */
  externalRef?: string;
  customerName: string;
  mobile: string;
  email: string;
  city: string;
  product: string;
  quantity: string;
  message: string;
  source: string;
  status: JustdialLeadStatus;
  createdAt: string;
}

/** DTO for creating, simulating, or mapping a Justdial lead. */
export type JustdialLeadInput = Omit<JustdialLead, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};

/** Result of merging a pull response into the local Justdial cache. */
export interface JustdialPullResult {
  added: number;
  skippedDuplicates: number;
  remoteCount: number;
}

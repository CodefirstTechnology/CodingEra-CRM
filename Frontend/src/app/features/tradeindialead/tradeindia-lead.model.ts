/** TradeIndia-sourced lead pipeline status (UI + localStorage). */
export type TradeIndiaLeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Converted';

export const TRADEINDIA_LEAD_STATUSES: readonly TradeIndiaLeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Converted',
] as const;

export function isTradeIndiaLeadStatus(value: string): value is TradeIndiaLeadStatus {
  return (TRADEINDIA_LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Normalized TradeIndia lead row used by the CRM UI.
 * Kept frontend-local until the backend/proxy contract is available.
 */
export interface TradeIndiaLead {
  id: number;
  /** Stable id from TradeIndia / middleware for deduplication when pulling from API. */
  externalRef?: string;
  customerName: string;
  mobile: string;
  email: string;
  city: string;
  /** Buyer company (`sender_co`) → CRM Organization. */
  companyName: string;
  /** Product inquired about (`product_name`) → CRM Requirement. */
  product: string;
  quantity: string;
  /** Full TradeIndia inquiry message (notes / detail). */
  message: string;
  source: string;
  status: TradeIndiaLeadStatus;
  createdAt: string;
}

/** DTO for creating, simulating, or mapping a TradeIndia lead. */
export type TradeIndiaLeadInput = Omit<TradeIndiaLead, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};

/** Result of merging a pull response into the local TradeIndia cache. */
export interface TradeIndiaPullResult {
  added: number;
  skippedDuplicates: number;
  remoteCount: number;
  newLeads?: TradeIndiaLead[];
  dbSaved?: number;
  dbSkipped?: number;
  dbFailed?: number;
  lastError?: string;
}

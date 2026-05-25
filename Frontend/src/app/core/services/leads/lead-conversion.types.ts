import type { DealRow } from '../../../features/deals/deals.component';
import type { LeadRow } from '../../../features/leads/lead-row.model';

/** Options for {@link LeadsService.convertToDeal}. */
export interface ConvertLeadOptions {
  /** When true (default), sets lead status to Converted and stores conversion metadata. */
  markAsConverted?: boolean;
  /** When true, deletes the lead after a successful deal is created. */
  removeFromActive?: boolean;
}

/** Result of a successful lead → deal conversion. */
export interface ConvertLeadResult {
  leadId: string;
  deal: DealRow;
  /** Updated lead row, or null when the lead was removed from the active list. */
  lead: LeadRow | null;
  convertedAt: string;
}

/** Payload shape for a future `POST /api/leads/:id/convert` endpoint. */
export interface ConvertLeadPayload {
  leadId: number;
  markAsConverted: boolean;
  removeFromActive: boolean;
  deal: Omit<DealRow, 'id'>;
}

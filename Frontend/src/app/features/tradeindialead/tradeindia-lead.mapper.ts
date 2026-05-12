import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { TradeIndiaLead } from './tradeindia-lead.model';

export const TRADEINDIA_LEAD_ROW_ID_PREFIX = 'ti-';

export function isTradeIndiaLeadRowId(id: string): boolean {
  return id.startsWith(TRADEINDIA_LEAD_ROW_ID_PREFIX);
}

/** Parses numeric TradeIndia id from a unified row id, or `null` if not a TradeIndia row. */
export function parseTradeIndiaNumericIdFromRowId(id: string): number | null {
  if (!isTradeIndiaLeadRowId(id)) return null;
  const n = Number(id.slice(TRADEINDIA_LEAD_ROW_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

function mapTradeIndiaStatusToLeadStatus(status: TradeIndiaLead['status']): LeadStatus {
  return status as LeadStatus;
}

/**
 * Maps persisted {@link TradeIndiaLead} into {@link LeadRow} for the unified Leads table.
 * Field mapping stays frontend-only until a shared backend DTO exists.
 */
export function mapTradeIndiaLeadToLeadRow(ti: TradeIndiaLead): LeadRow {
  const trimmed = ti.customerName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '-';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
  const created = new Date(ti.createdAt);
  const ts = Number.isFinite(created.getTime()) ? created.getTime() : Date.now();
  const updatedLabel = Number.isFinite(created.getTime())
    ? created.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : ti.createdAt;

  return {
    id: `${TRADEINDIA_LEAD_ROW_ID_PREFIX}${ti.id}`,
    name: trimmed || '-',
    firstName,
    lastName,
    mobile: ti.mobile.trim(),
    email: ti.email.trim(),
    organization: `${ti.product.trim()}${ti.quantity ? ` - ${ti.quantity.trim()}` : ''} (${ti.city.trim()})`,
    industry: 'Other',
    status: mapTradeIndiaStatusToLeadStatus(ti.status),
    leadOwnerName: '-',
    owner: 'TI',
    updated: updatedLabel,
    source: ti.source.trim(),
    requirement: ti.message.trim(),
    notes: ti.message.trim(),
    leadSource: 'TradeIndia',
    sortTimestamp: ts,
  };
}

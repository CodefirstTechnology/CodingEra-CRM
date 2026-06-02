import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { TradeIndiaLead } from './tradeindia-lead.model';

import {
  TRADEINDIA_LEAD_ROW_ID_PREFIX,
  isTradeIndiaLeadRowId,
  parseTradeIndiaNumericIdFromRowId,
} from '../leads/lead-marketplace-id.util';

export {
  TRADEINDIA_LEAD_ROW_ID_PREFIX,
  isTradeIndiaLeadRowId,
  parseTradeIndiaNumericIdFromRowId,
};

function mapTradeIndiaStatusToLeadStatus(status: TradeIndiaLead['status']): LeadStatus {
  const coerced = coerceLeadStatus(status);
  if (coerced === 'Converted') return 'Qualified';
  if (coerced === 'Lost') return 'Unqualified';
  return coerced;
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
    requirement: plainTextFromHtml(ti.message),
    notes: ti.message.trim(),
    leadSource: 'TradeIndia',
    sortTimestamp: ts,
  };
}

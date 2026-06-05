import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { JustdialLead } from './justdial-lead.model';

import {
  JUSTDIAL_LEAD_ROW_ID_PREFIX,
  isJustdialLeadRowId,
  parseJustdialNumericIdFromRowId,
} from '../leads/lead-marketplace-id.util';

export {
  JUSTDIAL_LEAD_ROW_ID_PREFIX,
  isJustdialLeadRowId,
  parseJustdialNumericIdFromRowId,
};

function mapJustdialStatusToLeadStatus(status: JustdialLead['status']): LeadStatus {
  const coerced = coerceLeadStatus(status);
  if (coerced === 'Converted') return 'Qualified';
  if (coerced === 'Lost') return 'Unqualified';
  return coerced;
}

/**
 * Maps persisted {@link JustdialLead} into {@link LeadRow} for the unified Leads table.
 * Field mapping stays frontend-only until a shared backend DTO exists.
 */
export function mapJustdialLeadToLeadRow(jd: JustdialLead): LeadRow {
  const trimmed = jd.customerName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '-';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
  const created = new Date(jd.createdAt);
  const ts = Number.isFinite(created.getTime()) ? created.getTime() : Date.now();
  const updatedLabel = Number.isFinite(created.getTime())
    ? created.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : jd.createdAt;

  return {
    id: `${JUSTDIAL_LEAD_ROW_ID_PREFIX}${jd.id}`,
    name: trimmed || '-',
    firstName,
    lastName,
    mobile: jd.mobile.trim(),
    email: jd.email.trim(),
    organization: `${jd.product.trim()}${jd.quantity ? ` - ${jd.quantity.trim()}` : ''} (${jd.city.trim()})`,
    industry: 'Other',
    status: mapJustdialStatusToLeadStatus(jd.status),
    leadOwnerName: '-',
    owner: 'JD',
    updated: updatedLabel,
    source: jd.source.trim(),
    requirement: plainTextFromHtml(jd.message),
    notes: jd.message.trim(),
    leadSource: 'Justdial',
    sortTimestamp: ts,
  };
}

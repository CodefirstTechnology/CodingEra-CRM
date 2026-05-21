import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { JustdialLead } from './justdial-lead.model';

export const JUSTDIAL_LEAD_ROW_ID_PREFIX = 'jd-';

export function isJustdialLeadRowId(id: string): boolean {
  return id.startsWith(JUSTDIAL_LEAD_ROW_ID_PREFIX);
}

/** Parses numeric Justdial id from a unified row id, or `null` if not a Justdial row. */
export function parseJustdialNumericIdFromRowId(id: string): number | null {
  if (!isJustdialLeadRowId(id)) return null;
  const n = Number(id.slice(JUSTDIAL_LEAD_ROW_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

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

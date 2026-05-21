import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { IndiaMartLead } from './indiamart-lead.model';

export const INDIAMART_LEAD_ROW_ID_PREFIX = 'im-';

export function isIndiamartLeadRowId(id: string): boolean {
  return id.startsWith(INDIAMART_LEAD_ROW_ID_PREFIX);
}

/** Parses numeric IndiaMART id from a unified row id, or `null` if not an IndiaMART row. */
export function parseIndiamartNumericIdFromRowId(id: string): number | null {
  if (!isIndiamartLeadRowId(id)) return null;
  const n = Number(id.slice(INDIAMART_LEAD_ROW_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

function mapIndiaMartStatusToLeadStatus(status: IndiaMartLead['status']): LeadStatus {
  const coerced = coerceLeadStatus(status);
  if (coerced === 'Converted') return 'Qualified';
  if (coerced === 'Lost') return 'Unqualified';
  return coerced;
}

/**
 * Maps persisted {@link IndiaMartLead} into {@link LeadRow} for the unified Leads table.
 * Field mapping is frontend-only until a shared API DTO exists.
 */
export function mapIndiaMartLeadToLeadRow(im: IndiaMartLead): LeadRow {
  const trimmed = im.customerName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '—';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '—';
  const created = new Date(im.createdAt);
  const ts = Number.isFinite(created.getTime()) ? created.getTime() : Date.now();
  const updatedLabel = Number.isFinite(created.getTime())
    ? created.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : im.createdAt;

  return {
    id: `${INDIAMART_LEAD_ROW_ID_PREFIX}${im.id}`,
    name: trimmed || '—',
    firstName,
    lastName,
    mobile: im.mobile.trim(),
    email: im.email.trim(),
    organization: '',
    industry: 'Other',
    status: mapIndiaMartStatusToLeadStatus(im.status),
    leadOwnerName: '—',
    owner: 'IM',
    updated: updatedLabel,
    source: im.source.trim(),
    requirement: im.message.trim(),
    notes: im.message.trim(),
    leadSource: 'IndiaMART',
    sortTimestamp: ts,
  };
}

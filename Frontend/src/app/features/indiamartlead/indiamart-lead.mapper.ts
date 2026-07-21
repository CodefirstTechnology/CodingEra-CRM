import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import {
  inboundEmail,
  inboundMobile,
  inboundPerson,
  inboundTitle,
  TextFormatter,
} from '../../shared/utils/text-normalizer';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { IndiaMartLead } from './indiamart-lead.model';

import {
  INDIAMART_LEAD_ROW_ID_PREFIX,
  isIndiamartLeadRowId,
  parseIndiamartNumericIdFromRowId,
} from '../leads/lead-marketplace-id.util';

export {
  INDIAMART_LEAD_ROW_ID_PREFIX,
  isIndiamartLeadRowId,
  parseIndiamartNumericIdFromRowId,
};

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
  const trimmed = inboundPerson(im.customerName) || im.customerName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = inboundPerson(parts[0] ?? '—') || '—';
  const lastName =
    parts.length > 1 ? inboundPerson(parts.slice(1).join(' ')) || parts.slice(1).join(' ') : '—';
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
    mobile: inboundMobile(im.mobile),
    email: inboundEmail(im.email),
    organization: '',
    industry: 'Other',
    status: mapIndiaMartStatusToLeadStatus(im.status),
    leadOwnerName: '—',
    owner: 'IM',
    updated: updatedLabel,
    source: inboundTitle(im.source) || im.source.trim(),
    requirement: TextFormatter.requirement(plainTextFromHtml(im.message)),
    notes: TextFormatter.description(plainTextFromHtml(im.message)),
    leadSource: 'IndiaMART',
    sortTimestamp: ts,
  };
}

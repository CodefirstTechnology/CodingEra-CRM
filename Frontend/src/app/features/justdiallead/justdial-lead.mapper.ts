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
  const trimmed = inboundPerson(jd.customerName) || jd.customerName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = inboundPerson(parts[0] ?? '-') || '-';
  const lastName =
    parts.length > 1 ? inboundPerson(parts.slice(1).join(' ')) || parts.slice(1).join(' ') : '-';
  const created = new Date(jd.createdAt);
  const ts = Number.isFinite(created.getTime()) ? created.getTime() : Date.now();
  const updatedLabel = Number.isFinite(created.getTime())
    ? created.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : jd.createdAt;
  const product = inboundTitle(jd.product) || jd.product.trim();
  const quantity = jd.quantity.trim();
  const city = inboundTitle(jd.city) || jd.city.trim();

  return {
    id: `${JUSTDIAL_LEAD_ROW_ID_PREFIX}${jd.id}`,
    name: trimmed || '-',
    firstName,
    lastName,
    mobile: inboundMobile(jd.mobile),
    email: inboundEmail(jd.email),
    organization: `${product}${quantity ? ` - ${quantity}` : ''} (${city})`,
    industry: 'Other',
    status: mapJustdialStatusToLeadStatus(jd.status),
    leadOwnerName: '-',
    owner: 'JD',
    updated: updatedLabel,
    source: inboundTitle(jd.source) || jd.source.trim(),
    requirement: TextFormatter.requirement(plainTextFromHtml(jd.message)),
    notes: TextFormatter.description(jd.message),
    leadSource: 'Justdial',
    sortTimestamp: ts,
  };
}

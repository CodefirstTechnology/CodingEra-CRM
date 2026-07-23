import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import {
  inboundCompany,
  inboundEmail,
  inboundMobile,
  inboundPerson,
  inboundTitle,
  TextFormatter,
} from '../../shared/utils/text-normalizer';
import type { LeadRow, LeadStatus } from '../leads/lead-row.model';
import type { TradeIndiaLead } from './tradeindia-lead.model';
import {
  looksLikePhoneNumber,
  parseTradeIndiaInquiryMessage,
  resolveTradeIndiaCustomerName,
} from './tradeindia-inquiry-parse';

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

/** Product text for the Requirement column (never the full inquiry template). */
export function tradeIndiaRequirementText(ti: Pick<TradeIndiaLead, 'product' | 'message'>): string {
  const product = plainTextFromHtml(ti.product);
  if (product && product !== '-' && product !== '—') return product;
  const parsed = parseTradeIndiaInquiryMessage(ti.message);
  if (parsed.product) return parsed.product;
  return '';
}

/** Company name for the Organization column. */
export function tradeIndiaOrganizationText(
  ti: Pick<TradeIndiaLead, 'companyName' | 'message'>,
): string {
  const company = ti.companyName?.trim();
  if (company && company !== '-' && company !== '—') return inboundCompany(company) || company;
  const fromMessage = parseTradeIndiaInquiryMessage(ti.message).companyName?.trim() || '';
  return fromMessage ? inboundCompany(fromMessage) || fromMessage : '';
}

/**
 * Maps persisted {@link TradeIndiaLead} into {@link LeadRow} for the unified Leads table.
 */
export function mapTradeIndiaLeadToLeadRow(ti: TradeIndiaLead): LeadRow {
  const displayNameRaw = resolveTradeIndiaCustomerName({
    senderName: looksLikePhoneNumber(ti.customerName) ? '' : ti.customerName,
    companyName: tradeIndiaOrganizationText(ti),
  });
  const displayName = inboundPerson(displayNameRaw) || displayNameRaw;
  const parts = displayName.split(/\s+/).filter(Boolean);
  const firstName = inboundPerson(parts[0] ?? '-') || '-';
  const lastName =
    parts.length > 1 ? inboundPerson(parts.slice(1).join(' ')) || parts.slice(1).join(' ') : '-';
  const created = new Date(ti.createdAt);
  const ts = Number.isFinite(created.getTime()) ? created.getTime() : Date.now();
  const updatedLabel = Number.isFinite(created.getTime())
    ? created.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : ti.createdAt;

  return {
    id: `${TRADEINDIA_LEAD_ROW_ID_PREFIX}${ti.id}`,
    name: displayName || '-',
    firstName,
    lastName,
    mobile: inboundMobile(ti.mobile),
    email: inboundEmail(ti.email),
    organization: tradeIndiaOrganizationText(ti),
    industry: 'Other',
    status: mapTradeIndiaStatusToLeadStatus(ti.status),
    leadOwnerName: '-',
    owner: 'TI',
    updated: updatedLabel,
    source: inboundTitle(ti.source) || ti.source.trim(),
    requirement: TextFormatter.requirement(tradeIndiaRequirementText(ti)),
    notes: TextFormatter.description(ti.message),
    leadSource: 'TradeIndia',
    sortTimestamp: ts,
  };
}

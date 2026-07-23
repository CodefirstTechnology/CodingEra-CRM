import {
  isConvertedLeadStatusName,
  resolveLeadStatusIdFromName,
} from '../../core/services/leads/lead-status.constants';
import type { ActivityGroup, ActivityRow } from '../../core/services/activities/activity-api.models';
import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';
import { TextFormatter } from './text-normalizer';

/** Minimum mobile digits for deal–lead contact matching (aligns with import validation). */
export const LEAD_DEAL_MATCH_MOBILE_MIN_DIGITS = 8;

/** Minimum mobile digits required to convert a lead without an email. */
export const LEAD_CONVERSION_MIN_MOBILE_DIGITS = 10;

export function leadContactName(lead: LeadRow): string {
  const full = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return full || lead.name.trim();
}

/** True when pipeline status is Qualified (by label or `lead_status_id`). */
export function isLeadQualifiedForConversion(
  lead: LeadRow,
  displayStatusLabel?: string,
): boolean {
  const label = (displayStatusLabel ?? lead.status ?? '').trim();
  if (label.toLowerCase() === 'qualified') return true;
  const qualifiedId = resolveLeadStatusIdFromName('Qualified');
  return qualifiedId != null && lead.leadStatusId === qualifiedId;
}

export function validateLeadForConversion(lead: LeadRow): string | null {
  if (!isLeadQualifiedForConversion(lead)) {
    return 'Only Qualified leads can be converted to a deal. Update the lead status first.';
  }
  const org = lead.organization?.trim();
  const contact = leadContactName(lead);
  if (!org && !contact) {
    return 'Add an organization or contact name before converting this lead.';
  }
  const email = lead.email?.trim();
  const mobile = normalizeLeadContactMobile(lead.mobile);
  if (!email && mobile.length < LEAD_CONVERSION_MIN_MOBILE_DIGITS) {
    return 'Add an email address or a valid mobile number before converting.';
  }
  return null;
}

/**
 * True when the lead is treated as converted for lock / badge UI.
 * Live-safe / backward-compatible:
 * - Flagged conversion status (any display name) or legacy "Converted" / "Moved to Deal"
 * - Local convert marker when status is still empty or Qualified (older UI-only convert)
 * Soft email/mobile deal links alone do not lock or rename status.
 */
export function isLeadConverted(
  lead: LeadRow,
  conversion?: { id?: number | null; name?: string | null },
): boolean {
  if (conversion?.id != null && conversion.id > 0 && lead.leadStatusId === conversion.id) {
    return true;
  }
  if (isConvertedLeadStatusName(lead.status ?? '')) return true;
  const convName = conversion?.name?.trim();
  if (convName && lead.status?.trim().toLowerCase() === convName.toLowerCase()) {
    return true;
  }

  // Local convert metadata (localStorage / sourceLeadId inference). Honor only while
  // status is still empty or Qualified (legacy overlay). Other pipeline statuses win.
  if (lead.isConverted === true) {
    const status = (lead.status ?? '').trim().toLowerCase();
    if (!status || status === 'qualified') return true;
    if (isConvertedLeadStatusName(status)) return true;
    if (convName && status === convName.toLowerCase()) return true;
  }

  return false;
}

export function normalizeLeadContactEmail(email: string | undefined): string {
  return TextFormatter.email(email);
}

export function normalizeLeadContactMobile(mobile: string | undefined): string {
  // Matching index uses digits only (legacy); strip non-digits after format.
  return TextFormatter.mobile(mobile).replace(/\D/g, '');
}

export function normalizeLeadRecordId(id: string | undefined): string {
  return String(id ?? '').trim();
}

function hasMatchableMobile(mobile: string): boolean {
  return mobile.length >= LEAD_DEAL_MATCH_MOBILE_MIN_DIGITS;
}

export interface LeadDealConversionIndex {
  byLeadId: ReadonlyMap<string, string>;
  byEmail: ReadonlyMap<string, string>;
  byMobile: ReadonlyMap<string, string>;
}

/** Maps deals from the API to lead ids (local `sourceLeadId` + email/mobile fallback). */
export function buildLeadDealConversionIndex(deals: readonly DealRow[]): LeadDealConversionIndex {
  const byLeadId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byMobile = new Map<string, string>();

  for (const deal of deals) {
    const dealId = normalizeLeadRecordId(deal.id);
    if (!dealId) continue;

    const sourceLeadId = normalizeLeadRecordId(deal.sourceLeadId);
    if (sourceLeadId) byLeadId.set(sourceLeadId, dealId);

    const email = normalizeLeadContactEmail(deal.email);
    if (email) byEmail.set(email, dealId);

    const mobile = normalizeLeadContactMobile(deal.mobile);
    if (hasMatchableMobile(mobile)) byMobile.set(mobile, dealId);
  }

  return { byLeadId, byEmail, byMobile };
}

export function inferConvertedDealIdFromIndex(
  lead: LeadRow,
  index: LeadDealConversionIndex,
): string | null {
  const leadId = normalizeLeadRecordId(lead.id);
  const byId = index.byLeadId.get(leadId);
  if (byId) return byId;

  const email = normalizeLeadContactEmail(lead.email);
  if (email) {
    const byEmail = index.byEmail.get(email);
    if (byEmail) return byEmail;
  }

  const mobile = normalizeLeadContactMobile(lead.mobile);
  if (hasMatchableMobile(mobile)) {
    const byMobile = index.byMobile.get(mobile);
    if (byMobile) return byMobile;
  }

  return null;
}

/**
 * Links a matching deal when found (cross-session / admin-safe).
 * - `sourceLeadId` → deal link + isConverted (real convert; status not rewritten)
 * - email/mobile → deal link only (View deal); does not lock status
 */
export function applyDealConversionInference(
  lead: LeadRow,
  index: LeadDealConversionIndex | null | undefined,
): LeadRow {
  if (!index) return lead;

  const leadId = normalizeLeadRecordId(lead.id);
  const bySource = index.byLeadId.get(leadId);
  if (bySource) {
    if (lead.isConverted === true && lead.convertedDealId === bySource) return lead;
    return {
      ...lead,
      isConverted: true,
      convertedDealId: bySource,
    };
  }

  if (lead.convertedDealId) return lead;

  const softDealId = inferConvertedDealIdFromIndex(lead, index);
  if (!softDealId) return lead;
  return {
    ...lead,
    convertedDealId: softDealId,
  };
}

export function buildLeadConversionActivityGroup(
  leadId: number,
  dealId: string,
  convertedAt: string,
): ActivityGroup {
  const whenLabel = formatConversionWhenLabel(convertedAt);
  const item: ActivityRow = {
    id: -1,
    entityType: 'lead',
    entityId: leadId,
    actionType: 'convert',
    actorUserId: null,
    actorName: 'System',
    message: 'Lead converted to deal',
    fieldName: 'deal',
    oldValue: null,
    newValue: dealId,
    relatedRecordType: 'deal',
    relatedRecordId: Number(dealId) || null,
    createdAt: convertedAt,
    whenLabel,
  };
  return {
    id: `conversion-${leadId}-${dealId}`,
    actorName: 'CRM',
    actorUserId: null,
    createdAt: convertedAt,
    whenLabel,
    items: [item],
    iconKind: 'bolt',
  };
}

function formatConversionWhenLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Just now';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Just now';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(t);
  } catch {
    return new Date(t).toLocaleString();
  }
}

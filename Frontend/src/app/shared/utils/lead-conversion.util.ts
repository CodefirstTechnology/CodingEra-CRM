import type { ActivityGroup, ActivityRow } from '../../core/services/activities/activity-api.models';
import type { LeadRow } from '../../features/leads/lead-row.model';

export function leadContactName(lead: LeadRow): string {
  const full = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return full || lead.name.trim();
}

export function validateLeadForConversion(lead: LeadRow): string | null {
  const org = lead.organization?.trim();
  const contact = leadContactName(lead);
  if (!org && !contact) {
    return 'Add an organization or contact name before converting this lead.';
  }
  const email = lead.email?.trim();
  const mobile = (lead.mobile ?? '').replace(/\D/g, '');
  if (!email && mobile.length < 10) {
    return 'Add an email address or a valid mobile number before converting.';
  }
  return null;
}

export function isLeadConverted(lead: LeadRow): boolean {
  return lead.isConverted === true || lead.status === 'Converted' || !!lead.convertedDealId;
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

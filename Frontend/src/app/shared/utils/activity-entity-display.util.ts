import type { ActivityEntityType } from '../../core/services/activities/activity-api.models';
import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';
import { dealPersonName, leadPersonName } from './lead-person-name.util';

/** Map key: `lead:48`, `deal:12`, etc. */
export function buildActivityEntityNameMap(leads: LeadRow[], deals: DealRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lead of leads) {
    const id = Number(lead.id);
    if (Number.isFinite(id) && id > 0) {
      map.set(`lead:${id}`, leadActivityDisplayName(lead));
    }
  }
  for (const deal of deals) {
    const id = Number(deal.id);
    if (Number.isFinite(id) && id > 0) {
      map.set(`deal:${id}`, dealActivityDisplayName(deal));
    }
  }
  return map;
}

export function leadActivityDisplayName(lead: LeadRow): string {
  const name = leadPersonName(lead);
  if (name !== '—') return name;
  const org = lead.organization?.trim();
  if (org) return org;
  return `Lead #${lead.id}`;
}

/** Contact name (`firstName` + `lastName`) for tasks, notes, and activity. */
export function dealActivityDisplayName(deal: DealRow): string {
  const name = dealPersonName(deal);
  if (name !== '—') return name;
  return `Deal #${deal.id}`;
}

/** Tasks / notes Record column for deals, e.g. `Deal - Rohit Contract`. */
export function formatDealRecordLabel(contactName: string): string {
  return `Deal - ${contactName.trim() || '—'}`;
}

/** Tasks / notes Record column for leads. */
export function formatLeadRecordLabel(contactName: string): string {
  return `Lead · ${contactName.trim() || '—'}`;
}

export function activityEntityDisplayLabel(
  entityType: ActivityEntityType | string,
  entityId: number,
  names: Map<string, string>,
): string {
  const key = `${String(entityType).toLowerCase()}:${entityId}`;
  const named = names.get(key);
  if (named) return named;
  const type = String(entityType).trim();
  const cap = type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : 'Record';
  return `${cap} #${entityId}`;
}

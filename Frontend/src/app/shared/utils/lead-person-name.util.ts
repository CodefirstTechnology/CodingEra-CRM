import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';
import type { NoteRow } from '../../features/notes/notes.component';
import type { TaskRow } from '../../features/tasks/tasks.component';
import { TextFormatter } from './text-normalizer';

/** Display name from `leads.first_name` + `leads.last_name`, falling back to `name`. */
export function leadPersonName(
  lead: Pick<LeadRow, 'firstName' | 'lastName' | 'name'>,
): string {
  const combined = [lead.firstName?.trim(), lead.lastName?.trim()].filter(Boolean).join(' ');
  const raw = combined || lead.name?.trim() || '';
  return TextFormatter.entityName('lead', raw) || '—';
}

/** Contact label for deals: `firstName` + `lastName` (not organization). */
export function dealPersonName(
  deal: Pick<DealRow, 'firstName' | 'lastName' | 'contactName' | 'dealTitle' | 'organizationName'>,
): string {
  const contactRaw =
    deal.contactName?.trim() ||
    [deal.firstName?.trim(), deal.lastName?.trim()].filter(Boolean).join(' ');
  if (contactRaw) {
    return TextFormatter.entityName('contact', contactRaw);
  }

  const title = deal.dealTitle?.trim();
  if (title) {
    const parts = title.split(/\s*[—–]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && !/^unknown organization$/i.test(last)) {
      return TextFormatter.entityName('contact', last);
    }
    if (!/^unknown organization(\s|$)/i.test(title)) {
      return TextFormatter.entityName('contact', title);
    }
  }

  return '—';
}

export function buildDealNameByIdMap(
  deals: readonly Pick<
    DealRow,
    'id' | 'firstName' | 'lastName' | 'contactName' | 'dealTitle' | 'organizationName'
  >[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const deal of deals) {
    const id = String(deal.id).trim();
    if (!id) continue;
    map.set(id, dealPersonName(deal));
  }
  return map;
}

export function buildLeadNameByIdMap(
  leads: readonly Pick<LeadRow, 'id' | 'firstName' | 'lastName' | 'name'>[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const lead of leads) {
    const id = String(lead.id).trim();
    if (!id) continue;
    map.set(id, leadPersonName(lead));
  }
  return map;
}

export function resolveTaskRelatedLeadId(task: Pick<TaskRow, 'relatedLeadId'>): string | undefined {
  const id = task.relatedLeadId?.trim();
  return id || undefined;
}

export function resolveTaskRelatedDealId(task: Pick<TaskRow, 'relatedDealId'>): string | undefined {
  const id = task.relatedDealId?.trim();
  return id || undefined;
}

export function resolveNoteRelatedDealId(
  note: Pick<NoteRow, 'relatedType' | 'relatedDealId' | 'relatedId'>,
): string | undefined {
  const explicit = note.relatedDealId?.trim();
  if (explicit) return explicit;
  if (note.relatedType === 'deal') {
    const rid = note.relatedId?.trim();
    if (rid) return rid;
  }
  return undefined;
}

/** Lead FK on a note: `related_lead_id`, or `record_id` / `related_id` when type is lead. */
export function resolveNoteRelatedLeadId(
  note: Pick<NoteRow, 'relatedType' | 'relatedLeadId' | 'relatedId'>,
): string | undefined {
  const explicit = note.relatedLeadId?.trim();
  if (explicit) return explicit;
  if (note.relatedType === 'lead') {
    const rid = note.relatedId?.trim();
    if (rid) return rid;
  }
  return undefined;
}

export function attachRelatedLeadName<T extends { relatedLeadName?: string }>(
  row: T,
  leadId: string | undefined,
  leadNames: Map<string, string>,
): T {
  if (!leadId) return row;
  const name = leadNames.get(leadId);
  if (!name) return row;
  return { ...row, relatedLeadName: name };
}

export function attachRelatedDealName<T extends { relatedDealName?: string; relatedName?: string }>(
  row: T,
  dealId: string | undefined,
  dealNames: Map<string, string>,
): T {
  if (!dealId) return row;
  const name = dealNames.get(dealId);
  if (!name) return row;
  return { ...row, relatedDealName: name, relatedName: name };
}

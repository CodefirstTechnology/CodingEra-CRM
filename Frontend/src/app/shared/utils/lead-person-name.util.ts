import type { LeadRow } from '../../features/leads/lead-row.model';
import type { NoteRow } from '../../features/notes/notes.component';
import type { TaskRow } from '../../features/tasks/tasks.component';

/** Display name from `leads.first_name` + `leads.last_name`, falling back to `name`. */
export function leadPersonName(
  lead: Pick<LeadRow, 'firstName' | 'lastName' | 'name'>,
): string {
  const combined = [lead.firstName?.trim(), lead.lastName?.trim()].filter(Boolean).join(' ');
  if (combined) return combined;
  const legacy = lead.name?.trim();
  return legacy || '—';
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

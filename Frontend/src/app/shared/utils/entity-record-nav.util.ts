import type { NoteRow } from '../../features/notes/notes.component';
import type { TaskRow } from '../../features/tasks/tasks.component';

export const ENTITY_ACTIVITY_TAB = 'Activity' as const;

export type EntityDetailTab =
  | 'Activity'
  | 'Emails'
  | 'Comments'
  | 'Data'
  | 'Tasks'
  | 'Notes'
  | 'Attachments';

const ENTITY_DETAIL_TABS: readonly EntityDetailTab[] = [
  'Activity',
  'Emails',
  'Comments',
  'Data',
  'Tasks',
  'Notes',
  'Attachments',
];

export function parseEntityDetailTab(raw: string | null | undefined): EntityDetailTab | null {
  const t = raw?.trim();
  if (!t) return null;
  return ENTITY_DETAIL_TABS.includes(t as EntityDetailTab) ? (t as EntityDetailTab) : null;
}

export interface EntityRecordActivityLink {
  routerLink: string[];
  queryParams: { tab: typeof ENTITY_ACTIVITY_TAB };
}

function buildActivityLink(base: '/leads' | '/deals', id: string): EntityRecordActivityLink | null {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    routerLink: [base, String(Math.trunc(n))],
    queryParams: { tab: ENTITY_ACTIVITY_TAB },
  };
}

export function resolveTaskRecordActivityLink(row: TaskRow): EntityRecordActivityLink | null {
  const leadId = row.relatedLeadId?.trim();
  if (leadId) return buildActivityLink('/leads', leadId);
  const dealId = row.relatedDealId?.trim();
  if (dealId) return buildActivityLink('/deals', dealId);
  return null;
}

export function resolveNoteRecordActivityLink(row: NoteRow): EntityRecordActivityLink | null {
  if (row.relatedType === 'lead') {
    const id = row.relatedLeadId?.trim() || row.relatedId?.trim();
    if (id) return buildActivityLink('/leads', id);
  }
  if (row.relatedType === 'deal') {
    const id = row.relatedDealId?.trim() || row.relatedId?.trim();
    if (id) return buildActivityLink('/deals', id);
  }
  return null;
}

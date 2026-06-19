import type { ContactRow } from '../../contacts/contacts.component';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { NoteRow } from '../../notes/notes.component';
import type { TaskRow } from '../../tasks/tasks.component';

export function parseSessionUserId(userId: string | undefined | null): number | null {
  if (userId == null || !String(userId).trim()) return null;
  const n = Number(String(userId).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function userIdsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const an = Number(left);
  const bn = Number(right);
  return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
}

function labelMatchesUser(
  label: string | undefined | null,
  userName: string,
  userEmail: string,
): boolean {
  const want = label?.trim().toLowerCase();
  if (!want) return false;
  const name = userName.trim().toLowerCase();
  const email = userEmail.trim().toLowerCase();
  return want === name || want === email || (name.length > 0 && want.includes(name));
}

/** Lead is owned when `leadOwnerId` matches logged-in `users.id`. */
export function isLeadOwnedByUser(
  lead: LeadRow,
  userId: string,
  userName = '',
  userEmail = '',
): boolean {
  if (userIdsMatch(lead.leadOwnerId, userId)) return true;
  const numeric = parseSessionUserId(userId);
  const ownerNumeric = parseSessionUserId(lead.leadOwnerId);
  if (numeric != null && ownerNumeric != null && numeric === ownerNumeric) return true;
  if (labelMatchesUser(lead.leadOwnerName, userName, userEmail)) return true;
  return false;
}

/** Deal is owned when `dealOwnerId` or `assignedToUserId` matches session user. */
export function isDealOwnedByUser(
  deal: DealRow,
  userId: string,
  userName = '',
  userEmail = '',
): boolean {
  if (userIdsMatch(deal.dealOwnerId, userId)) return true;
  if (userIdsMatch(deal.assignedToUserId, userId)) return true;
  const numeric = parseSessionUserId(userId);
  if (numeric != null) {
    const owner = parseSessionUserId(deal.dealOwnerId);
    const assigned = parseSessionUserId(deal.assignedToUserId);
    if (owner === numeric || assigned === numeric) return true;
  }
  if (labelMatchesUser(deal.assignedTo, userName, userEmail)) return true;
  const uid = userId.trim();
  if (uid && deal.assignedTo.trim() === `User #${uid}`) return true;
  return false;
}

/** Task is assigned when `assignedToUserId` matches session user. */
export function isTaskAssignedToUser(
  task: TaskRow,
  userId: string,
  userName = '',
  userEmail = '',
): boolean {
  if (userIdsMatch(task.assignedToUserId, userId)) return true;
  if (userIdsMatch(task.assignedTo, userId)) return true;
  const numeric = parseSessionUserId(userId);
  const assignee = parseSessionUserId(task.assignedToUserId);
  if (numeric != null && assignee != null && numeric === assignee) return true;
  if (labelMatchesUser(task.assignedTo, userName, userEmail)) return true;
  return false;
}

export function isNoteByUser(
  note: NoteRow,
  userId: string,
  userName: string,
  userEmail: string,
): boolean {
  if (userIdsMatch(note.authorUserId, userId)) return true;
  const numeric = parseSessionUserId(userId);
  const author = parseSessionUserId(note.authorUserId);
  if (numeric != null && author != null && numeric === author) return true;
  return labelMatchesUser(note.author, userName, userEmail);
}

/** Notes linked to the user's leads or deals. */
export function isNoteRelatedToUserRecords(
  note: NoteRow,
  leadIds: ReadonlySet<string>,
  dealIds: ReadonlySet<string>,
): boolean {
  const lid = note.relatedLeadId?.trim();
  if (lid && leadIds.has(lid)) return true;
  const did = note.relatedDealId?.trim();
  if (did && dealIds.has(did)) return true;
  return false;
}

/** Strict match: `users.id` === `leads.lead_owner_id` (mapped to `leadOwnerId`). */
export function isLeadOwnedByLeadOwnerFk(lead: LeadRow, userId: string): boolean {
  const uid = parseSessionUserId(userId);
  const owner = parseSessionUserId(lead.leadOwnerId);
  return uid != null && owner != null && uid === owner;
}

export function filterLeadsByLeadOwnerId(rows: LeadRow[], userId: string): LeadRow[] {
  const uid = parseSessionUserId(userId);
  if (uid == null) return [];
  return rows.filter((r) => isLeadOwnedByLeadOwnerFk(r, userId));
}

export function filterContactsByCreatedBy(rows: ContactRow[], userId: string): ContactRow[] {
  const uid = parseSessionUserId(userId);
  if (uid == null) return [];
  return rows.filter((r) => {
    const createdBy = parseSessionUserId(r.createdBy);
    return createdBy != null && createdBy === uid;
  });
}

export function filterLeadsForUser(
  rows: LeadRow[],
  userId: string,
  userName: string,
  userEmail: string,
): LeadRow[] {
  return rows.filter((r) => isLeadOwnedByUser(r, userId, userName, userEmail));
}

export function filterDealsForUser(
  rows: DealRow[],
  userId: string,
  userName: string,
  userEmail: string,
): DealRow[] {
  return rows.filter((r) => isDealOwnedByUser(r, userId, userName, userEmail));
}

export function filterTasksForUser(
  rows: TaskRow[],
  userId: string,
  userName: string,
  userEmail: string,
): TaskRow[] {
  return rows.filter((r) => isTaskAssignedToUser(r, userId, userName, userEmail));
}

export function filterNotesForUser(
  rows: NoteRow[],
  userId: string,
  userName: string,
  userEmail: string,
  leadIds: ReadonlySet<string>,
  dealIds: ReadonlySet<string>,
): NoteRow[] {
  return rows.filter(
    (n) =>
      isNoteByUser(n, userId, userName, userEmail) ||
      isNoteRelatedToUserRecords(n, leadIds, dealIds),
  );
}

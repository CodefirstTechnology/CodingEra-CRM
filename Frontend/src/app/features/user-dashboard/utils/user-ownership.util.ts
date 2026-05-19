import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { NoteRow } from '../../notes/notes.component';
import type { TaskRow } from '../../tasks/tasks.component';

export function userIdsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const an = Number(left);
  const bn = Number(right);
  return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
}

function labelMatchesUser(label: string | undefined | null, userName: string, userEmail: string): boolean {
  const want = label?.trim().toLowerCase();
  if (!want) return false;
  const name = userName.trim().toLowerCase();
  const email = userEmail.trim().toLowerCase();
  return want === name || want === email || (name.length > 0 && want.includes(name));
}

export function isLeadOwnedByUser(
  lead: LeadRow,
  userId: string,
  userName = '',
  userEmail = '',
): boolean {
  if (userIdsMatch(lead.leadOwnerId, userId)) return true;
  if (labelMatchesUser(lead.leadOwnerName, userName, userEmail)) return true;
  return false;
}

export function isDealOwnedByUser(
  deal: DealRow,
  userId: string,
  userName = '',
  userEmail = '',
): boolean {
  if (userIdsMatch(deal.dealOwnerId, userId)) return true;
  if (labelMatchesUser(deal.assignedTo, userName, userEmail)) return true;
  const uid = userId.trim();
  if (uid && deal.assignedTo.trim() === `User #${uid}`) return true;
  return false;
}

export function isTaskAssignedToUser(
  task: TaskRow,
  userId: string,
  userName = '',
  userEmail = '',
): boolean {
  if (userIdsMatch(task.assignedTo, userId)) return true;
  if (labelMatchesUser(task.assignedTo, userName, userEmail)) return true;
  return false;
}

export function isNoteByUser(note: NoteRow, userName: string, userEmail: string): boolean {
  return labelMatchesUser(note.author, userName, userEmail);
}

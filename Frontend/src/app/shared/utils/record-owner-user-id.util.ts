import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';

/** Numeric `users.id` only (ignores legacy picker keys like SK). */
export function resolveNumericRecordOwnerUserId(
  userId: string | undefined | null,
): string | undefined {
  const t = userId?.trim();
  if (!t || !/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : undefined;
}

export function leadRecordOwnerUserId(
  lead: Pick<LeadRow, 'leadOwnerId'>,
): string | undefined {
  return resolveNumericRecordOwnerUserId(lead.leadOwnerId);
}

export function dealRecordOwnerUserId(
  deal: Pick<DealRow, 'assignedToUserId' | 'dealOwnerId'>,
): string | undefined {
  return (
    resolveNumericRecordOwnerUserId(deal.assignedToUserId) ??
    resolveNumericRecordOwnerUserId(deal.dealOwnerId)
  );
}

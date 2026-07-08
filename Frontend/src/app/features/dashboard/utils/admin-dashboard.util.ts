import type { MasterDataOption } from '../../../core/services/leads/lead-master-data.service';
import {
  isDealClosed,
  isDealClosedLost,
  isDealClosedWon,
} from '../../../core/services/deals/deal-pipeline.constants';
import { DEAL_STAGE_MATERIAL_DELIVERED } from '../../../core/services/deals/deal-stage-milestones.constants';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type {
  AdminDashboardPeriod,
  AdminDashboardPeriodKey,
  AdminTeamMemberStats,
  AdminTeamSortKey,
} from '../models/admin-dashboard.models';
import type { UserTargetRow } from '../../../core/services/user-targets/user-target-api.models';

export const STUCK_DEAL_INACTIVE_HOURS = 24;
export const STUCK_DEAL_PREVIEW_LIMIT = 5;

/** Deal stages that should never appear in the stuck-deals panel. */
const STUCK_DEAL_EXCLUDED_STATUS_NAMES = [
  DEAL_STAGE_MATERIAL_DELIVERED,
  'Lead Closed - Won',
  'Lead Closed - Lost',
] as const;

function dealStatusNamesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when a deal may appear in stuck-deals (open pipeline + not completed/closed). */
export function isStuckDealCandidate(
  status: string,
  pipeline: readonly MasterDataOption[] = [],
): boolean {
  const label = status?.trim() ?? '';
  if (!label) return false;

  if (STUCK_DEAL_EXCLUDED_STATUS_NAMES.some((name) => dealStatusNamesMatch(label, name))) {
    return false;
  }

  if (isDealClosedWon(label, pipeline) || isDealClosedLost(label, pipeline)) {
    return false;
  }

  return isActiveDealStatus(label, pipeline);
}

export function parseDashboardDate(
  raw: string | Date | number | undefined | null,
): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  const lower = s.toLowerCase();
  if (lower === 'just now' || lower.includes('today')) return new Date();
  if (lower.includes('yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
  const dMatch = lower.match(/^(\d+)\s*d(?:ays?)?\s*ago$/);
  if (dMatch) {
    const d = new Date();
    d.setDate(d.getDate() - Number(dMatch[1]));
    return d;
  }
  const wMatch = lower.match(/^(\d+)\s*w(?:eeks?)?\s*ago$/);
  if (wMatch) {
    const d = new Date();
    d.setDate(d.getDate() - Number(wMatch[1]) * 7);
    return d;
  }
  return null;
}

export function parseDateOnly(iso: string): Date | null {
  const s = iso.trim();
  if (!s) return null;
  const t = Date.parse(s.includes('T') ? s : `${s}T00:00:00`);
  if (Number.isNaN(t)) return null;
  return startOfDay(new Date(t));
}

export function dealLastModifiedDate(deal: DealRow): Date | null {
  return (
    parseDashboardDate(deal.lastModifiedAt) ??
    parseDashboardDate(deal.lastModified) ??
    null
  );
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

export function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return endOfMonth(new Date(d.getFullYear(), q * 3 + 2, 1));
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function endOfYear(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), 11, 31));
}

export function resolveDashboardPeriod(
  key: AdminDashboardPeriodKey,
  ref = new Date(),
): AdminDashboardPeriod {
  const now = ref;
  switch (key) {
    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        key,
        label: 'Last month',
        start: startOfMonth(prev),
        end: endOfMonth(prev),
      };
    }
    case 'this_quarter':
      return {
        key,
        label: 'This quarter',
        start: startOfQuarter(now),
        end: endOfQuarter(now),
      };
    case 'this_year':
      return {
        key,
        label: 'This year',
        start: startOfYear(now),
        end: endOfYear(now),
      };
    case 'this_month':
    default:
      return {
        key: 'this_month',
        label: 'This month',
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
  }
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const t = startOfDay(date).getTime();
  return t >= startOfDay(start).getTime() && t <= endOfDay(end).getTime();
}

export function leadRecordDate(lead: LeadRow): Date | null {
  if (lead.sortTimestamp != null && Number.isFinite(lead.sortTimestamp)) {
    return new Date(lead.sortTimestamp);
  }
  return parseDashboardDate(lead.created) ?? parseDashboardDate(lead.updated);
}

export function dealRecordDate(deal: DealRow): Date | null {
  return (
    parseDashboardDate(deal.lastModifiedAt) ??
    parseDashboardDate(deal.createdAtAt) ??
    parseDashboardDate(deal.createdAt) ??
    parseDashboardDate(deal.lastModified)
  );
}

export function isLeadConvertedRow(lead: LeadRow): boolean {
  return lead.status === 'Converted' || lead.isConverted === true;
}

export function resolveDealValue(deal: DealRow): number {
  if (Number.isFinite(deal.dealAmount) && deal.dealAmount > 0) {
    return deal.dealAmount;
  }
  if (Number.isFinite(deal.annualRevenue) && deal.annualRevenue > 0) {
    return deal.annualRevenue;
  }
  return 0;
}

export function isActiveDealStatus(
  status: string,
  pipeline: readonly MasterDataOption[] = [],
): boolean {
  return !isDealClosed(status, pipeline);
}

export function isDealWonInPeriod(
  deal: DealRow,
  pipeline: readonly MasterDataOption[],
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (!isDealClosedWon(deal.status, pipeline)) return false;
  const t = dealRecordDate(deal);
  return t != null && isDateInRange(t, periodStart, periodEnd);
}

export function isDealLostInPeriod(
  deal: DealRow,
  pipeline: readonly MasterDataOption[],
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (!isDealClosedLost(deal.status, pipeline)) return false;
  const t = dealRecordDate(deal);
  return t != null && isDateInRange(t, periodStart, periodEnd);
}

export function targetOverlapsPeriod(
  target: UserTargetRow,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (!target.isActive) return false;
  const ts = parseDateOnly(target.startDate);
  const te = parseDateOnly(target.endDate);
  if (!ts || !te) return false;
  return ts.getTime() <= endOfDay(periodEnd).getTime() && te.getTime() >= startOfDay(periodStart).getTime();
}

export function dealDisplayName(deal: DealRow): string {
  const title = deal.dealTitle?.trim();
  if (title) return title;
  const org = deal.organizationName?.trim();
  const person = [deal.firstName, deal.lastName].filter(Boolean).join(' ').trim();
  if (org && person) return `${org} — ${person}`;
  return org || person || `Deal #${deal.id}`;
}

export function dealOwnerLabel(deal: DealRow): string {
  const assigned = deal.assignedTo?.trim();
  if (assigned && assigned !== '—') return assigned;
  return deal.assignedInitials?.trim() || 'Unassigned';
}

export function leadDisplayName(lead: LeadRow): string {
  const named = lead.name?.trim();
  if (named) return named;
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return person || lead.organization?.trim() || `Lead #${lead.id}`;
}

export function leadOwnerLabel(lead: LeadRow): string {
  return lead.leadOwnerName?.trim() || lead.owner?.trim() || 'Unassigned';
}

export function ownerKeyFromDeal(deal: DealRow): string {
  const id = deal.dealOwnerId?.trim() || deal.assignedToUserId?.trim();
  return id || '';
}

export function ownerKeyFromLead(lead: LeadRow): string {
  return lead.leadOwnerId?.trim() || '';
}

export function formatRelativeTime(isoOrDate: string | Date): string {
  const t =
    isoOrDate instanceof Date
      ? isoOrDate.getTime()
      : Date.parse(String(isoOrDate));
  if (Number.isNaN(t)) return '—';

  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return 'Just now';

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(t));
  } catch {
    return new Date(t).toLocaleDateString();
  }
}

export function sortTeamMembers(
  rows: AdminTeamMemberStats[],
  key: AdminTeamSortKey,
  desc = true,
): AdminTeamMemberStats[] {
  const mul = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return a.name.localeCompare(b.name);
    return av < bv ? -1 * mul : 1 * mul;
  });
}

export function countLeadsByStatus(leads: LeadRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of leads) {
    const key = l.status || 'New';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

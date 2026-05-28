import type { LeadRow } from '../../leads/lead-row.model';
import type { DealRow } from '../../deals/deals.component';
import type { AdminTeamMemberStats, AdminTeamSortKey } from '../models/admin-dashboard.models';

export const ADMIN_MONTHLY_TARGET_INR = 1_000_000;
export const STUCK_DEAL_INACTIVE_DAYS = 14;
export const STUCK_DEAL_LIMIT = 5;

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
  const dMatch = lower.match(/^(\d+)\s*d\s*ago$/);
  if (dMatch) {
    const d = new Date();
    d.setDate(d.getDate() - Number(dMatch[1]));
    return d;
  }
  return null;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isInCurrentMonth(date: Date, ref: Date): boolean {
  return (
    date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth()
  );
}

export function leadRecordDate(lead: LeadRow): Date | null {
  if (lead.sortTimestamp != null && Number.isFinite(lead.sortTimestamp)) {
    return new Date(lead.sortTimestamp);
  }
  return parseDashboardDate(lead.created) ?? parseDashboardDate(lead.updated);
}

export function dealRecordDate(deal: DealRow): Date | null {
  return (
    parseDashboardDate(deal.createdAt) ??
    parseDashboardDate(deal.lastModified)
  );
}

export function isLeadConvertedRow(lead: LeadRow): boolean {
  return lead.status === 'Converted' || lead.isConverted === true;
}

export function isActiveDealStatus(status: string): boolean {
  const s = status.trim();
  return s !== 'Closed Won' && s !== 'Closed Lost';
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

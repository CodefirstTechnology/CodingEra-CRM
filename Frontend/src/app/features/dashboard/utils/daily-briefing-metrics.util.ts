import { isDealClosedLost, isDealClosedWon } from '../../../core/services/deals/deal-pipeline.constants';
import {
  dealLastModifiedDate,
  dealRecordDate,
  isActiveDealStatus,
  leadRecordDate,
  parseDashboardDate,
  STUCK_DEAL_INACTIVE_HOURS,
  startOfDay,
} from './admin-dashboard.util';
import type { AdminDashboardSnapshot } from '../models/admin-dashboard.models';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { TaskRow } from '../../tasks/tasks.component';
import type { DailyBriefingMetrics } from '../../../core/services/dashboard/dashboard-api.models';

const STUCK_LEAD_STATUSES = new Set(['New', 'Contacted', 'Nurture', 'Unqualified', 'Qualified']);

function isToday(date: Date | null, todayStart: Date): boolean {
  if (!date) return false;
  return date >= todayStart && date < new Date(todayStart.getTime() + 86_400_000);
}

function parseTaskDue(task: TaskRow): Date | null {
  const raw = task.dueDateRaw || task.dueDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isMeetingTask(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes('meeting') || t.includes('review') || t.includes('demo');
}

function isTaskComplete(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'done' || s === 'canceled' || s === 'cancelled';
}

function inactiveHoursSince(date: Date | null, now: Date): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3_600_000));
}

function countStuckDeals(deals: DealRow[], now: Date): number {
  return deals.filter((d) => {
    if (!isActiveDealStatus(d.status)) return false;
    return inactiveHoursSince(dealLastModifiedDate(d), now) >= STUCK_DEAL_INACTIVE_HOURS;
  }).length;
}

function leadLastTouchDate(lead: LeadRow): Date | null {
  return parseDashboardDate(lead.updated) ?? leadRecordDate(lead);
}

function countStuckLeads(leads: LeadRow[], now: Date): number {
  return leads.filter((l) => {
    if (!STUCK_LEAD_STATUSES.has(l.status)) return false;
    return inactiveHoursSince(leadLastTouchDate(l), now) >= STUCK_DEAL_INACTIVE_HOURS;
  }).length;
}

/** Builds briefing metrics from the same records the admin dashboard uses. */
export function buildDailyBriefingMetrics(
  snapshot: AdminDashboardSnapshot,
  leads: LeadRow[],
  deals: DealRow[],
  tasks: TaskRow[],
  adminName?: string,
): DailyBriefingMetrics {
  const now = new Date();
  const todayStart = startOfDay(now);

  let pendingFollowUps = 0;
  let followUpsToday = 0;
  let overdueFollowUps = 0;
  let meetingsToday = 0;
  let tasksDueToday = 0;
  const overdueLeadIds = new Set<string>();

  for (const task of tasks) {
    if (isTaskComplete(task.status)) continue;
    const due = parseTaskDue(task);
    if (!due) continue;

    const dueStart = startOfDay(due);
    const isMeeting = isMeetingTask(task.title || '');

    if (isMeeting) {
      if (dueStart.getTime() === todayStart.getTime()) {
        meetingsToday++;
        tasksDueToday++;
      }
      continue;
    }

    pendingFollowUps++;

    if (dueStart.getTime() === todayStart.getTime()) {
      followUpsToday++;
      tasksDueToday++;
    } else if (dueStart < todayStart) {
      overdueFollowUps++;
      if (task.relatedLeadId) overdueLeadIds.add(String(task.relatedLeadId));
    }
  }

  const newLeadsToday = leads.filter((l) => isToday(leadRecordDate(l), todayStart)).length;
  const newDealsToday = deals.filter((d) => isToday(dealRecordDate(d), todayStart)).length;
  const activeDeals = deals.filter((d) => isActiveDealStatus(d.status));

  const dealsPendingClosure = activeDeals.filter((d) => {
    const raw = d.nextFollowUpDate;
    if (!raw) return false;
    const dt = new Date(raw);
    return !Number.isNaN(dt.getTime()) && startOfDay(dt).getTime() === todayStart.getTime();
  }).length;

  const dealsWonToday = deals.filter(
    (d) => isDealClosedWon(d.status) && isToday(dealLastModifiedDate(d), todayStart),
  ).length;

  const dealsLostToday = deals.filter(
    (d) => isDealClosedLost(d.status) && isToday(dealLastModifiedDate(d), todayStart),
  ).length;

  const wonToday = deals.filter(
    (d) => isDealClosedWon(d.status) && isToday(dealLastModifiedDate(d), todayStart),
  );
  const revenueToday = wonToday.reduce(
    (sum, d) => sum + (Number.isFinite(d.annualRevenue) ? d.annualRevenue : 0),
    0,
  );

  const highPriorityLeads = leads.filter(
    (l) =>
      (l.status === 'Qualified' || l.status === 'Converted') &&
      overdueLeadIds.has(String(l.id)),
  ).length;

  return {
    adminName: adminName?.trim() || undefined,
    totalLeads: snapshot.kpis.totalLeads,
    activeDeals: snapshot.kpis.activePipelineCount,
    newLeadsToday,
    newDealsToday,
    pendingFollowUps,
    followUpsToday,
    overdueFollowUps,
    dealsPendingClosure,
    dealsWonToday,
    dealsLostToday,
    meetingsToday,
    tasksDueToday,
    highPriorityLeads,
    stuckDealsCount: countStuckDeals(deals, now),
    stuckLeadsCount: countStuckLeads(leads, now),
    revenueToday: revenueToday > 0 ? revenueToday : null,
  };
}

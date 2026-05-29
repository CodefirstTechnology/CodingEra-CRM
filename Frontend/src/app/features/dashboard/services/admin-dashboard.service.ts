import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ROLE_ID_USER } from '../../../core/auth/auth-role.util';
import { AuthService } from '../../../core/auth/auth.service';
import type { AdminUserRow } from '../../../core/services/admin-users.service';
import { AdminUsersService } from '../../../core/services/admin-users.service';
import { ActivitiesService } from '../../../core/services/activities.service';
import type { ActivityRow } from '../../../core/services/activities/activity-api.models';
import { DealsService } from '../../../core/services/deals.service';
import { isDealClosedLost, isDealClosedWon } from '../../../core/services/deals/deal-pipeline.constants';
import { DEFAULT_DEAL_PIPELINE_STATUS } from '../../../core/services/deals/deal-pipeline.constants';
import { LeadsService, leadsHttpErrorMessage } from '../../../core/services/leads.service';
import { TasksService } from '../../../core/services/tasks.service';
import {
  activityEntityDisplayLabel,
  buildActivityEntityNameMap,
} from '../../../shared/utils/activity-entity-display.util';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { TaskRow } from '../../tasks/tasks.component';
import type {
  AdminActivityStreamItem,
  AdminDashboardSnapshot,
  AdminPipelineSegment,
  AdminStuckDealRow,
  AdminTeamMemberStats,
} from '../models/admin-dashboard.models';
import {
  ADMIN_MONTHLY_TARGET_INR,
  countLeadsByStatus,
  dealDisplayName,
  dealOwnerLabel,
  dealLastModifiedDate,
  dealRecordDate,
  formatRelativeTime,
  isActiveDealStatus,
  isInCurrentMonth,
  isLeadConvertedRow,
  leadRecordDate,
  ownerKeyFromDeal,
  ownerKeyFromLead,
  STUCK_DEAL_INACTIVE_DAYS,
  STUCK_DEAL_LIMIT,
  startOfDay,
  startOfMonth,
} from '../utils/admin-dashboard.util';

interface GroupedRecords {
  leadsByOwner: Map<string, LeadRow[]>;
  dealsByOwner: Map<string, DealRow[]>;
  tasksByAssignee: Map<string, TaskRow[]>;
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly tasksService = inject(TasksService);
  private readonly activitiesService = inject(ActivitiesService);

  loadSnapshot(): Observable<{ data: AdminDashboardSnapshot | null; error: string | null }> {
    const token = this.auth.token();

    return forkJoin({
      users: this.adminUsers.listUsers(token).pipe(catchError(() => of([] as AdminUserRow[]))),
      leads: this.leadsService.getAll().pipe(catchError(() => of([] as LeadRow[]))),
      deals: this.dealsService.getAll().pipe(catchError(() => of([] as DealRow[]))),
      tasks: this.tasksService.getAll().pipe(catchError(() => of([] as TaskRow[]))),
    }).pipe(
      switchMap(({ users, leads, deals, tasks }) => {
        const salesUsers = users.filter((u) => u.roleId === ROLE_ID_USER);
        const grouped = this.groupRecords(leads, deals, tasks);
        const entityNames = buildActivityEntityNameMap(leads, deals);

        const leadIds = this.recentRecordIds(leads, 30);
        const dealIds = this.recentRecordIds(deals, 30);

        return this.activitiesService.getRecentForRecords(leadIds, dealIds, 50).pipe(
          catchError(() => of([] as ActivityRow[])),
          map((activities) => ({
            data: this.buildSnapshot(
              salesUsers,
              leads,
              deals,
              tasks,
              grouped,
              activities,
              entityNames,
            ),
            error: null as string | null,
          })),
        );
      }),
      catchError((err: unknown) =>
        of({ data: null, error: leadsHttpErrorMessage(err) }),
      ),
    );
  }

  private groupRecords(
    leads: LeadRow[],
    deals: DealRow[],
    tasks: TaskRow[],
  ): GroupedRecords {
    const leadsByOwner = new Map<string, LeadRow[]>();
    const dealsByOwner = new Map<string, DealRow[]>();
    const tasksByAssignee = new Map<string, TaskRow[]>();

    for (const lead of leads) {
      const key = ownerKeyFromLead(lead) || '__unassigned__';
      const bucket = leadsByOwner.get(key);
      if (bucket) bucket.push(lead);
      else leadsByOwner.set(key, [lead]);
    }

    for (const deal of deals) {
      const key = ownerKeyFromDeal(deal) || '__unassigned__';
      const bucket = dealsByOwner.get(key);
      if (bucket) bucket.push(deal);
      else dealsByOwner.set(key, [deal]);
    }

    for (const task of tasks) {
      const key = task.assignedToUserId?.trim() || task.assignedTo?.trim() || '__unassigned__';
      const bucket = tasksByAssignee.get(key);
      if (bucket) bucket.push(task);
      else tasksByAssignee.set(key, [task]);
    }

    return { leadsByOwner, dealsByOwner, tasksByAssignee };
  }

  private recentRecordIds<T extends { id: string; sortTimestamp?: number; updated?: string; lastModified?: string }>(
    rows: T[],
    limit: number,
  ): number[] {
    return [...rows]
      .sort((a, b) => {
        const ta =
          a.sortTimestamp ??
          Date.parse(String(a.updated ?? a.lastModified ?? '')) ??
          0;
        const tb =
          b.sortTimestamp ??
          Date.parse(String(b.updated ?? b.lastModified ?? '')) ??
          0;
        return tb - ta;
      })
      .slice(0, limit)
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  private buildSnapshot(
    salesUsers: AdminUserRow[],
    allLeads: LeadRow[],
    allDeals: DealRow[],
    allTasks: TaskRow[],
    grouped: GroupedRecords,
    activities: ActivityRow[],
    entityNames: Map<string, string>,
  ): AdminDashboardSnapshot {
    const now = new Date();
    const monthStart = startOfMonth(now);

    const kpis = this.buildKpis(allLeads, allDeals, now, monthStart);
    const pipelineSegments = this.buildPipelineSegments(allDeals);
    const team = this.buildTeamStats(salesUsers, grouped, now, monthStart);
    const stuckDeals = this.buildStuckDeals(allDeals, now);
    const activityItems = activities.map((row) =>
      this.toActivityStreamItem(row, entityNames),
    );
    const focusInsight = this.buildFocusInsight(allLeads, monthStart);

    return {
      kpis,
      pipelineSegments,
      team,
      stuckDeals,
      activities: activityItems,
      focusInsight,
    };
  }

  private buildKpis(
    leads: LeadRow[],
    deals: DealRow[],
    now: Date,
    monthStart: Date,
  ): AdminDashboardSnapshot['kpis'] {
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter((l) => l.status === 'Qualified').length;
    const convertedLeads = leads.filter((l) => isLeadConvertedRow(l)).length;
    const junkCount = leads.filter((l) => l.status === 'Junk').length;
    const denominator = Math.max(1, totalLeads - junkCount);
    const conversionRatePct =
      totalLeads === 0
        ? 0
        : Math.round((convertedLeads / denominator) * 1000) / 10;

    const newLeadsThisMonth = leads.filter((l) => {
      const d = leadRecordDate(l);
      return d != null && isInCurrentMonth(d, now) && d >= monthStart;
    }).length;

    const activeDeals = deals.filter((d) => isActiveDealStatus(d.status));
    const pipelineRevenue = activeDeals.reduce(
      (sum, d) => sum + (Number.isFinite(d.annualRevenue) ? d.annualRevenue : 0),
      0,
    );

    const monthlyRevenue = deals
      .filter((d) => isDealClosedWon(d.status))
      .filter((d) => {
        const t = dealRecordDate(d);
        return t != null && t >= monthStart && isInCurrentMonth(t, now);
      })
      .reduce((sum, d) => sum + (Number.isFinite(d.annualRevenue) ? d.annualRevenue : 0), 0);

    const monthlyTarget = ADMIN_MONTHLY_TARGET_INR;
    const monthlyTargetAchievedPct = Math.min(
      100,
      Math.round((monthlyRevenue / monthlyTarget) * 100),
    );

    return {
      totalLeads,
      qualifiedLeads,
      convertedLeads,
      conversionRatePct,
      newLeadsThisMonth,
      activePipelineCount: activeDeals.length,
      pipelineRevenue,
      monthlyRevenue,
      monthlyTarget,
      monthlyTargetAchievedPct,
    };
  }

  private buildPipelineSegments(deals: DealRow[]): AdminPipelineSegment[] {
    const active = deals.filter((d) => isActiveDealStatus(d.status));
    const byStatus = new Map<string, { count: number; revenue: number }>();

    for (const d of active) {
      const key = d.status?.trim() || DEFAULT_DEAL_PIPELINE_STATUS;
      const cur = byStatus.get(key) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number.isFinite(d.annualRevenue) ? d.annualRevenue : 0;
      byStatus.set(key, cur);
    }

    const totalRev =
      [...byStatus.values()].reduce((s, v) => s + v.revenue, 0) || 1;

    return [...byStatus.entries()]
      .map(([label, v]) => ({
        label,
        count: v.count,
        revenue: v.revenue,
        pct: Math.round((v.revenue / totalRev) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }

  private buildTeamStats(
    salesUsers: AdminUserRow[],
    grouped: GroupedRecords,
    now: Date,
    monthStart: Date,
  ): AdminTeamMemberStats[] {
    const rows: AdminTeamMemberStats[] = [];

    for (const user of salesUsers) {
      const uid = user.id.trim();
      const userLeads = grouped.leadsByOwner.get(uid) ?? [];
      const userDeals = grouped.dealsByOwner.get(uid) ?? [];
      const statusCounts = countLeadsByStatus(userLeads);
      const totalLeads = userLeads.length;
      const convertedLeads = userLeads.filter((l) => isLeadConvertedRow(l)).length;
      const junk = statusCounts['Junk'] ?? 0;
      const denom = Math.max(1, totalLeads - junk);

      const activeDeals = userDeals.filter((d) => isActiveDealStatus(d.status));
      const closedWonMonth = userDeals.filter(
        (d) =>
          isDealClosedWon(d.status) &&
          (() => {
            const t = dealRecordDate(d);
            return t != null && t >= monthStart && isInCurrentMonth(t, now);
          })(),
      );
      const closedLostMonth = userDeals.filter(
        (d) =>
          isDealClosedLost(d.status) &&
          (() => {
            const t = dealRecordDate(d);
            return t != null && t >= monthStart && isInCurrentMonth(t, now);
          })(),
      );

      const monthlyRevenue = closedWonMonth.reduce(
        (sum, d) => sum + (Number.isFinite(d.annualRevenue) ? d.annualRevenue : 0),
        0,
      );

      rows.push({
        userId: uid,
        name: user.name,
        email: user.email,
        totalLeads,
        qualifiedLeads: statusCounts['Qualified'] ?? 0,
        contactedLeads: statusCounts['Contacted'] ?? 0,
        nurtureLeads: statusCounts['Nurture'] ?? 0,
        unqualifiedLeads: statusCounts['Unqualified'] ?? 0,
        junkLeads: junk,
        lostLeads: statusCounts['Lost'] ?? 0,
        convertedLeads,
        conversionRatePct:
          totalLeads === 0 ? 0 : Math.round((convertedLeads / denom) * 1000) / 10,
        activeDeals: activeDeals.length,
        dealsClosedWon: closedWonMonth.length,
        dealsClosedLost: closedLostMonth.length,
        monthlyRevenue,
      });
    }

    return rows;
  }

  private buildStuckDeals(deals: DealRow[], now: Date): AdminStuckDealRow[] {
    const today = startOfDay(now);
    const msPerDay = 86_400_000;

    return deals
      .filter((d) => isActiveDealStatus(d.status))
      .map((d) => {
        const modified = dealLastModifiedDate(d) ?? today;
        const inactiveDays = Math.max(
          0,
          Math.floor((today.getTime() - startOfDay(modified).getTime()) / msPerDay),
        );
        return {
          deal: d,
          inactiveDays,
        };
      })
      .filter((x) => x.inactiveDays >= STUCK_DEAL_INACTIVE_DAYS)
      .sort((a, b) => b.inactiveDays - a.inactiveDays)
      .slice(0, STUCK_DEAL_LIMIT)
      .map(({ deal, inactiveDays }) => ({
        id: deal.id,
        dealName: dealDisplayName(deal),
        company: deal.organizationName?.trim() || '—',
        owner: dealOwnerLabel(deal),
        stage: deal.status,
        inactiveDays,
        revenue: Number.isFinite(deal.annualRevenue) ? deal.annualRevenue : 0,
      }));
  }

  private buildFocusInsight(leads: LeadRow[], monthStart: Date): string {
    const qualifiedThisMonth = leads.filter((l) => {
      if (l.status !== 'Qualified') return false;
      const d = leadRecordDate(l);
      return d != null && d >= monthStart;
    }).length;

    if (qualifiedThisMonth > 0) {
      return `${qualifiedThisMonth} lead${qualifiedThisMonth === 1 ? '' : 's'} reached Qualified this month. Prioritize follow-up while interest is high.`;
    }

    const newCount = leads.filter((l) => {
      const d = leadRecordDate(l);
      return d != null && d >= monthStart;
    }).length;

    if (newCount > 0) {
      return `${newCount} new lead${newCount === 1 ? '' : 's'} this month. Review assignment and first-touch tasks.`;
    }

    return 'No new qualified leads this month yet. Sync marketplace sources or assign outreach on open pipeline.';
  }

  private toActivityStreamItem(
    row: ActivityRow,
    entityNames: Map<string, string>,
  ): AdminActivityStreamItem {
    const entityTypeRaw = String(row.entityType).toLowerCase();
    const entityType: AdminActivityStreamItem['entityType'] =
      entityTypeRaw === 'lead' ? 'lead' : entityTypeRaw === 'deal' ? 'deal' : 'other';

    const entityId = String(row.entityId);
    let recordRoute: string | null = null;
    if (entityType === 'lead' && entityId) {
      recordRoute = `/leads/${entityId}`;
    } else if (entityType === 'deal' && entityId) {
      recordRoute = `/deals/${entityId}`;
    }

    const action = row.actionType.toLowerCase();
    let kind: AdminActivityStreamItem['kind'] = 'other';
    if (entityType === 'lead') kind = 'lead';
    else if (entityType === 'deal') kind = 'deal';
    else if (action.includes('task')) kind = 'task';
    else if (action.includes('call')) kind = 'call';
    else if (action.includes('meeting')) kind = 'meeting';
    else if (action.includes('email') || action.includes('mail')) kind = 'email';

    const description =
      row.fieldName && (row.oldValue != null || row.newValue != null)
        ? `${row.fieldName}: ${row.oldValue ?? '—'} → ${row.newValue ?? '—'}`
        : row.message;

    const timeLabel = row.createdAt
      ? formatRelativeTime(row.createdAt)
      : row.whenLabel;

    return {
      id: `activity-${row.id}`,
      kind,
      entityType,
      entityId,
      recordRoute,
      title: row.message,
      company: activityEntityDisplayLabel(row.entityType, row.entityId, entityNames),
      description,
      timeLabel,
      rep: row.actorName || 'System',
    };
  }
}

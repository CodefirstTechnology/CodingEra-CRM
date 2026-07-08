import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { ROLE_ID_USER } from '../../../core/auth/auth-role.util';
import type { AdminUserRow } from '../../../core/services/admin-users.service';
import { CrmEntityCacheService } from '../../../core/services/crm-entity-cache.service';
import { UserDataScopeService } from '../../../core/services/user-data-scope.service';
import { ActivitiesService } from '../../../core/services/activities.service';
import type { ActivityRow } from '../../../core/services/activities/activity-api.models';
import { DealMasterSelectService } from '../../../core/services/deals/deal-master-select.service';
import {
  toDealPipelineRows,
  type DealPipelineStatusRow,
} from '../../../core/services/deals/deal-pipeline-config.util';
import type { MasterDataOption } from '../../../core/services/leads/lead-master-data.service';
import { leadsHttpErrorMessage } from '../../../core/services/leads.service';
import { UserTargetHttpService } from '../../../core/services/user-targets/user-target-http.service';
import type { UserTargetRow } from '../../../core/services/user-targets/user-target-api.models';
import {
  activityEntityDisplayLabel,
  buildActivityEntityNameMap,
} from '../../../shared/utils/activity-entity-display.util';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { TaskRow } from '../../tasks/tasks.component';
import type {
  AdminActivityStreamItem,
  AdminDashboardPeriod,
  AdminDashboardPeriodKey,
  AdminDashboardSnapshot,
  AdminDealDetail,
  AdminLeadDetail,
  AdminPipelineSegment,
  AdminStuckDealRow,
  AdminTeamMemberStats,
} from '../models/admin-dashboard.models';
import {
  countLeadsByStatus,
  dealDisplayName,
  dealOwnerLabel,
  dealLastModifiedDate,
  dealRecordDate,
  formatRelativeTime,
  isActiveDealStatus,
  isDateInRange,
  isDealLostInPeriod,
  isDealWonInPeriod,
  isLeadConvertedRow,
  leadDisplayName,
  leadOwnerLabel,
  leadRecordDate,
  ownerKeyFromDeal,
  ownerKeyFromLead,
  resolveDashboardPeriod,
  resolveDealValue,
  isStuckDealCandidate,
  STUCK_DEAL_INACTIVE_HOURS,
  targetOverlapsPeriod,
} from '../utils/admin-dashboard.util';

interface GroupedRecords {
  leadsByOwner: Map<string, LeadRow[]>;
  dealsByOwner: Map<string, DealRow[]>;
  tasksByAssignee: Map<string, TaskRow[]>;
}

interface DashboardBuildContext {
  period: AdminDashboardPeriod;
  pipeline: DealPipelineStatusRow[];
  pipelineOptions: MasterDataOption[];
  targets: UserTargetRow[];
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly entityCache = inject(CrmEntityCacheService);
  private readonly scope = inject(UserDataScopeService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly dealMaster = inject(DealMasterSelectService);
  private readonly userTargetsApi = inject(UserTargetHttpService);

  loadSnapshot(
    periodKey: AdminDashboardPeriodKey = 'this_month',
  ): Observable<{ data: AdminDashboardSnapshot | null; error: string | null }> {
    const period = resolveDashboardPeriod(periodKey);

    return this.dealMaster.ensureStatusesLoaded().pipe(
      take(1),
      switchMap((statusOptions) => {
        const pipelineOptions = [...statusOptions];
        const pipeline = toDealPipelineRows(pipelineOptions);

        return forkJoin({
          users: this.entityCache.listUsers().pipe(catchError(() => of([] as AdminUserRow[]))),
          leads: this.entityCache.listLeads().pipe(catchError(() => of([] as LeadRow[]))),
          deals: this.entityCache.listDeals().pipe(catchError(() => of([] as DealRow[]))),
          tasks: this.scope.listTasks().pipe(catchError(() => of([] as TaskRow[]))),
          targets: this.userTargetsApi.listTargets(false).pipe(catchError(() => of([] as UserTargetRow[]))),
        }).pipe(
          switchMap(({ users, leads, deals, tasks, targets }) => {
            const salesUsers = users.filter((u) => u.roleId === ROLE_ID_USER);
            const grouped = this.groupRecords(leads, deals, tasks);
            const entityNames = buildActivityEntityNameMap(leads, deals);
            const ctx: DashboardBuildContext = { period, pipeline, pipelineOptions, targets };

            return this.activitiesService.getRecentFeed(50).pipe(
              catchError(() => of([] as ActivityRow[])),
              map((activities) => ({
                data: this.buildSnapshot(
                  ctx,
                  salesUsers,
                  leads,
                  deals,
                  grouped,
                  activities,
                  entityNames,
                ),
                error: null as string | null,
              })),
            );
          }),
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

  private buildSnapshot(
    ctx: DashboardBuildContext,
    salesUsers: AdminUserRow[],
    allLeads: LeadRow[],
    allDeals: DealRow[],
    grouped: GroupedRecords,
    activities: ActivityRow[],
    entityNames: Map<string, string>,
  ): AdminDashboardSnapshot {
    const { period, pipeline, pipelineOptions, targets } = ctx;
    const overlappingTargets = targets.filter((t) =>
      targetOverlapsPeriod(t, period.start, period.end),
    );

    const leadDetails = this.buildLeadDetails(allLeads);
    const newLeads = allLeads.filter((l) => {
      const d = leadRecordDate(l);
      return d != null && isDateInRange(d, period.start, period.end);
    });
    const newLeadDetails = this.buildLeadDetails(newLeads);
    const openDeals = allDeals.filter((d) => isActiveDealStatus(d.status, pipelineOptions));
    const openDealDetails = openDeals.map((d) => this.toDealDetail(d));

    const kpis = this.buildKpis(allLeads, openDeals, overlappingTargets, ctx);
    const pipelineSegments = this.buildPipelineSegments(openDeals, pipeline);
    const team = this.buildTeamStats(salesUsers, grouped, overlappingTargets, ctx);
    const stuckDeals = this.buildStuckDeals(allDeals, pipelineOptions);
    const activityItems = activities.map((row) =>
      this.toActivityStreamItem(row, entityNames),
    );
    const focusInsight = this.buildFocusInsight(allLeads, period);

    return {
      period,
      kpis,
      pipelineSegments,
      team,
      stuckDeals,
      leadDetails,
      newLeadDetails,
      openDealDetails,
      activities: activityItems,
      focusInsight,
    };
  }

  private buildLeadDetails(leads: LeadRow[]): AdminLeadDetail[] {
    return leads.map((l) => ({
      id: l.id,
      name: leadDisplayName(l),
      company: l.organization?.trim() || '—',
      status: l.status || 'New',
      owner: leadOwnerLabel(l),
    }));
  }

  private toDealDetail(deal: DealRow, inactiveHours?: number): AdminDealDetail {
    return {
      id: deal.id,
      dealName: dealDisplayName(deal),
      company: deal.organizationName?.trim() || '—',
      owner: dealOwnerLabel(deal),
      ownerUserId: ownerKeyFromDeal(deal),
      stage: deal.status?.trim() || '—',
      value: resolveDealValue(deal),
      inactiveHours,
    };
  }

  private buildKpis(
    leads: LeadRow[],
    openDeals: DealRow[],
    overlappingTargets: UserTargetRow[],
    ctx: DashboardBuildContext,
  ): AdminDashboardSnapshot['kpis'] {
    const { period, pipelineOptions } = ctx;
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter((l) => l.status === 'Qualified').length;
    const convertedLeads = leads.filter((l) => isLeadConvertedRow(l)).length;
    const junkCount = leads.filter((l) => l.status === 'Junk').length;
    const denominator = Math.max(1, totalLeads - junkCount);
    const conversionRatePct =
      totalLeads === 0
        ? 0
        : Math.round((convertedLeads / denominator) * 1000) / 10;

    const newLeadsInPeriod = leads.filter((l) => {
      const d = leadRecordDate(l);
      return d != null && isDateInRange(d, period.start, period.end);
    }).length;

    const pipelineRevenue = openDeals.reduce((sum, d) => sum + resolveDealValue(d), 0);

    const periodTarget = overlappingTargets.reduce((sum, t) => sum + t.targetAmount, 0);
    const periodAchieved = overlappingTargets.reduce((sum, t) => sum + t.achievedAmount, 0);
    const targetAchievedPct =
      periodTarget > 0
        ? Math.min(100, Math.round((periodAchieved / periodTarget) * 100))
        : 0;

    return {
      totalLeads,
      qualifiedLeads,
      convertedLeads,
      conversionRatePct,
      newLeadsInPeriod,
      activePipelineCount: openDeals.length,
      pipelineRevenue,
      periodAchieved,
      periodTarget,
      targetAchievedPct,
      hasTargetsConfigured: overlappingTargets.length > 0 && periodTarget > 0,
    };
  }

  private buildPipelineSegments(
    openDeals: DealRow[],
    pipeline: DealPipelineStatusRow[],
  ): AdminPipelineSegment[] {
    const openStages = pipeline.filter((s) => !s.isWon && !s.isLost);
    const buckets = new Map<string, AdminDealDetail[]>();

    for (const stage of openStages) {
      buckets.set(stage.name, []);
    }

    for (const deal of openDeals) {
      const key = deal.status?.trim() || '';
      const list = buckets.get(key) ?? [];
      list.push(this.toDealDetail(deal));
      buckets.set(key, list);
    }

    const totalRev = openDeals.reduce((sum, d) => sum + resolveDealValue(d), 0) || 1;

    const segments: AdminPipelineSegment[] = openStages.map((stage) => {
      const deals = buckets.get(stage.name) ?? [];
      const revenue = deals.reduce((sum, d) => sum + d.value, 0);
      return {
        label: stage.name,
        statusId: stage.id,
        sortOrder: stage.sortOrder,
        count: deals.length,
        revenue,
        pct: Math.round((revenue / totalRev) * 100),
        deals,
      };
    });

    for (const [statusName, deals] of buckets.entries()) {
      if (openStages.some((s) => s.name === statusName)) continue;
      if (deals.length === 0) continue;
      const revenue = deals.reduce((sum, d) => sum + d.value, 0);
      segments.push({
        label: statusName || 'Unknown',
        statusId: 0,
        sortOrder: 9999,
        count: deals.length,
        revenue,
        pct: Math.round((revenue / totalRev) * 100),
        deals,
      });
    }

    return segments;
  }

  private buildTeamStats(
    salesUsers: AdminUserRow[],
    grouped: GroupedRecords,
    overlappingTargets: UserTargetRow[],
    ctx: DashboardBuildContext,
  ): AdminTeamMemberStats[] {
    const { period, pipelineOptions } = ctx;
    const rows: AdminTeamMemberStats[] = [];

    for (const user of salesUsers) {
      const uid = user.id.trim();
      const numericUid = Number(uid);
      const userLeads = grouped.leadsByOwner.get(uid) ?? [];
      const userDeals = grouped.dealsByOwner.get(uid) ?? [];
      const statusCounts = countLeadsByStatus(userLeads);
      const totalLeads = userLeads.length;
      const convertedLeads = userLeads.filter((l) => isLeadConvertedRow(l)).length;
      const junk = statusCounts['Junk'] ?? 0;
      const denom = Math.max(1, totalLeads - junk);

      const activeDeals = userDeals.filter((d) =>
        isActiveDealStatus(d.status, pipelineOptions),
      );
      const closedWonPeriod = userDeals.filter((d) =>
        isDealWonInPeriod(d, pipelineOptions, period.start, period.end),
      );
      const closedLostPeriod = userDeals.filter((d) =>
        isDealLostInPeriod(d, pipelineOptions, period.start, period.end),
      );

      const userTargets = overlappingTargets.filter((t) => t.userId === numericUid);
      const targetAmount = userTargets.reduce((sum, t) => sum + t.targetAmount, 0);
      const targetAchieved = userTargets.reduce((sum, t) => sum + t.achievedAmount, 0);
      const wonDealRevenue = closedWonPeriod.reduce((sum, d) => sum + resolveDealValue(d), 0);
      const monthlyRevenue = userTargets.length > 0 ? targetAchieved : wonDealRevenue;

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
        dealsClosedWon: closedWonPeriod.length,
        dealsClosedLost: closedLostPeriod.length,
        monthlyRevenue,
        targetAmount,
        targetAchieved,
      });
    }

    return rows;
  }

  private buildStuckDeals(
    deals: DealRow[],
    pipelineOptions: MasterDataOption[],
  ): AdminStuckDealRow[] {
    const msPerHour = 3_600_000;
    const now = new Date();

    return deals
      .filter((d) => isStuckDealCandidate(d.status, pipelineOptions))
      .map((d) => {
        const modified = dealLastModifiedDate(d) ?? now;
        const inactiveHours = Math.max(
          0,
          Math.floor((now.getTime() - modified.getTime()) / msPerHour),
        );
        return { deal: d, inactiveHours };
      })
      .filter((x) => x.inactiveHours >= STUCK_DEAL_INACTIVE_HOURS)
      .sort((a, b) => b.inactiveHours - a.inactiveHours)
      .map(({ deal, inactiveHours }) => ({
        id: deal.id,
        dealName: dealDisplayName(deal),
        company: deal.organizationName?.trim() || '—',
        owner: dealOwnerLabel(deal),
        stage: deal.status,
        inactiveHours,
        revenue: resolveDealValue(deal),
      }));
  }

  private buildFocusInsight(leads: LeadRow[], period: AdminDashboardPeriod): string {
    const qualifiedInPeriod = leads.filter((l) => {
      if (l.status !== 'Qualified') return false;
      const d = leadRecordDate(l);
      return d != null && isDateInRange(d, period.start, period.end);
    }).length;

    if (qualifiedInPeriod > 0) {
      return `${qualifiedInPeriod} lead${qualifiedInPeriod === 1 ? '' : 's'} reached Qualified in ${period.label.toLowerCase()}. Prioritize follow-up while interest is high.`;
    }

    const newCount = leads.filter((l) => {
      const d = leadRecordDate(l);
      return d != null && isDateInRange(d, period.start, period.end);
    }).length;

    if (newCount > 0) {
      return `${newCount} new lead${newCount === 1 ? '' : 's'} in ${period.label.toLowerCase()}. Review assignment and first-touch tasks.`;
    }

    return `No new qualified leads in ${period.label.toLowerCase()} yet. Sync marketplace sources or assign outreach on open pipeline.`;
  }

  private toActivityStreamItem(
    row: ActivityRow,
    entityNames: Map<string, string>,
  ): AdminActivityStreamItem {
    const entityTypeRaw = String(row.entityType).toLowerCase();
    const isItemMasterEntity =
      entityTypeRaw === 'item' ||
      entityTypeRaw === 'item_group' ||
      entityTypeRaw === 'item_attribute';
    const entityType: AdminActivityStreamItem['entityType'] =
      entityTypeRaw === 'lead'
        ? 'lead'
        : entityTypeRaw === 'deal'
          ? 'deal'
          : 'other';

    const entityId = String(row.entityId);
    let recordRoute: string | null = null;
    if (entityType === 'lead' && entityId) {
      recordRoute = `/leads/${entityId}`;
    } else if (entityType === 'deal' && entityId) {
      recordRoute = `/deals/${entityId}`;
    } else if (isItemMasterEntity) {
      recordRoute = '/advanced-settings';
    }

    const action = row.actionType.toLowerCase();
    let kind: AdminActivityStreamItem['kind'] = 'other';
    if (entityType === 'lead') kind = 'lead';
    else if (entityType === 'deal') kind = 'deal';
    else if (isItemMasterEntity) kind = 'item';
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

    const company = isItemMasterEntity
      ? 'Item Master'
      : activityEntityDisplayLabel(row.entityType, row.entityId, entityNames);

    return {
      id: `activity-${row.id}`,
      kind,
      entityType,
      entityId,
      recordRoute,
      title: row.message,
      company,
      description,
      timeLabel,
      rep: row.actorName || 'System',
    };
  }
}

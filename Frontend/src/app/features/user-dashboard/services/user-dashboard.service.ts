import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ActivitiesService } from '../../../core/services/activities.service';
import type { ActivityRow } from '../../../core/services/activities/activity-api.models';
import { AuthService } from '../../../core/auth/auth.service';
import { CrmEntityCacheService } from '../../../core/services/crm-entity-cache.service';
import { UserDataScopeService } from '../../../core/services/user-data-scope.service';
import { isDealClosed, isDealClosedWon } from '../../../core/services/deals/deal-pipeline.constants';
import { LeadOwnerOptionsService } from '../../../core/services/leads/lead-owner-options.service';
import { leadsHttpErrorMessage } from '../../../core/services/leads.service';
import {
  dealDisplayName,
  dealRecordDate,
  endOfDay,
  leadRecordDate,
  parseDashboardDate,
  resolveDashboardPeriod,
  startOfDay,
} from '../../dashboard/utils/admin-dashboard.util';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { TaskRow } from '../../tasks/tasks.component';
import {
  activityEntityDisplayLabel,
  buildActivityEntityNameMap,
} from '../../../shared/utils/activity-entity-display.util';
import { parseSessionUserId } from '../utils/user-ownership.util';
import type {
  UserDashboardActivityItem,
  UserDashboardDealDetail,
  UserDashboardFilters,
  UserDashboardFollowUpItem,
  UserDashboardKpis,
  UserDashboardLeadStatusSummary,
  UserDashboardLeadTableRow,
  UserDashboardPerformance,
  UserDashboardPeriodKey,
  UserDashboardQuotationDetail,
  UserDashboardRevenueDealDetail,
  UserDashboardSnapshot,
  UserDashboardTaskDetail,
} from '../models/user-dashboard.models';
import type { QuotationListItem } from '../../../core/services/quotations/quotation-api.models';

@Injectable({ providedIn: 'root' })
export class UserDashboardService {
  private readonly auth = inject(AuthService);
  private readonly entityCache = inject(CrmEntityCacheService);
  private readonly scope = inject(UserDataScopeService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);

  /**
   * Loads dashboard data scoped to the logged-in user and filtered by active date period.
   */
  loadSnapshot(filters?: Partial<UserDashboardFilters>): Observable<{ data: UserDashboardSnapshot | null; error: string | null }> {
    const user = this.auth.user();
    const userId = user?.id?.trim() ?? '';
    if (!user || parseSessionUserId(userId) == null) {
      return of({
        data: null,
        error: 'No valid user id in session. Log out and log in again.',
      });
    }

    return forkJoin({
      owners: this.leadOwnerOpts.ensureLoaded(),
      leads: this.entityCache.listLeads().pipe(catchError(() => of([] as LeadRow[]))),
      deals: this.entityCache.listDeals().pipe(catchError(() => of([] as DealRow[]))),
      tasks: this.scope.listTasks().pipe(catchError(() => of([] as TaskRow[]))),
      quotations: this.scope.listQuotations().pipe(catchError(() => of([] as QuotationListItem[]))),
    }).pipe(
      switchMap(({ leads, deals, tasks, quotations }) => {
        const enriched = this.leadOwnerOpts.enrichRows(leads);

        const leadIds = new Set(
          enriched.map((l) => Number(l.id)).filter((n) => Number.isFinite(n) && n > 0),
        );
        const dealIds = new Set(
          deals.map((d) => Number(d.id)).filter((n) => Number.isFinite(n) && n > 0),
        );

        return this.activitiesService
          .getRecentFeed(20, { leadIds, dealIds })
          .pipe(
            catchError(() => of([] as ActivityRow[])),
            map((activities) => {
              const entityNames = buildActivityEntityNameMap(enriched, deals);
              return {
                data: this.buildSnapshot(enriched, deals, tasks, quotations, activities, entityNames, filters),
                error: null as string | null,
              };
            }),
          );
      }),
      catchError((err: unknown) =>
        of({ data: null, error: leadsHttpErrorMessage(err) }),
      ),
    );
  }

  private buildSnapshot(
    allUserLeads: LeadRow[],
    allUserDeals: DealRow[],
    allUserTasks: TaskRow[],
    quotations: QuotationListItem[],
    activities: ActivityRow[],
    entityNames: Map<string, string>,
    filters?: Partial<UserDashboardFilters>,
  ): UserDashboardSnapshot {
    const periodKey: UserDashboardPeriodKey = filters?.periodKey ?? 'this_month';
    const customRange = filters?.customRange ?? null;

    const period = resolveDashboardPeriod(periodKey, new Date(), customRange);
    const periodStart = period.start;
    const periodEnd = period.end;

    // Filter Leads by active period
    const filteredLeads = allUserLeads.filter((l) => {
      const recDate = leadRecordDate(l) ?? parseDashboardDate(l.leadDate);
      return recDate ? this.isDateInPeriod(recDate, periodStart, periodEnd) : true;
    });

    // Filter Deals by active period
    const filteredDeals = allUserDeals.filter((d) => {
      const recDate = dealRecordDate(d) ?? parseDashboardDate(d.lastModifiedAt || d.lastModified || d.createdAt);
      return recDate ? this.isDateInPeriod(recDate, periodStart, periodEnd) : true;
    });

    // Filter Tasks by active period
    const filteredTasks = allUserTasks.filter((t) => {
      const recDate = parseDashboardDate(t.dueDateRaw || t.dueDate || t.lastModified);
      return recDate ? this.isDateInPeriod(recDate, periodStart, periodEnd) : true;
    });

    // Filter Quotations by active period
    const filteredQuotations = (quotations || []).filter((q) => {
      const recDate = parseDashboardDate(q.quotationDate || q.createdAt || q.updatedAt);
      return recDate ? this.isDateInPeriod(recDate, periodStart, periodEnd) : true;
    });

    // Today's leads
    const today = startOfDay(new Date());
    const todaysLeads = filteredLeads.filter((l) => {
      const t = leadRecordDate(l);
      return t && t >= today;
    });

    const activeDeals = filteredDeals.filter((d) => !isDealClosed(d.status));
    const closedWonDeals = allUserDeals.filter((d) => {
      if (!isDealClosedWon(d.status)) return false;
      const t = dealRecordDate(d) ?? parseDashboardDate(d.lastModifiedAt || d.lastModified);
      return t ? this.isDateInPeriod(t, periodStart, periodEnd) : true;
    });

    const pendingTasks = filteredTasks.filter((t) => t.status !== 'Done' && t.status !== 'Canceled');
    const completedTasks = filteredTasks.filter((t) => t.status === 'Done');
    const followUps = this.buildFollowUps(allUserTasks, periodStart, periodEnd);

    const periodRevenue = closedWonDeals.reduce((sum, d) => {
      return sum + (Number.isFinite(d.dealAmount) && d.dealAmount > 0 ? d.dealAmount : 0);
    }, 0);

    const converted = filteredLeads.filter((l) => l.status === 'Converted' || l.isConverted === true).length;
    const conversionPct = filteredLeads.length
      ? Math.round((converted / filteredLeads.length) * 1000) / 10
      : 0;
    const closureRate = filteredLeads.length
      ? Math.round((closedWonDeals.length / filteredLeads.length) * 1000) / 10
      : 0;

    const targetProgressPct = Math.min(100, Math.round((closedWonDeals.length / 10) * 100));

    const taskDueByLead = this.buildLeadNextFollowUpMap(filteredTasks);
    const tableRows = filteredLeads.map((l) => this.toLeadTableRow(l, taskDueByLead.get(l.id)));

    // Filter Activities
    const filteredActivities = activities
      .filter((act) => {
        const actDate = parseDashboardDate(act.createdAt);
        return actDate ? this.isDateInPeriod(actDate, periodStart, periodEnd) : true;
      })
      .map((row) => this.toDashboardActivityItem(row, entityNames));

    const quotationDetails: UserDashboardQuotationDetail[] = filteredQuotations.map((q) => ({
      id: q.id,
      quotationNumber: q.quotationNumber || `QT-${q.id}`,
      customerName: q.customerName || q.contactPerson || '—',
      companyName: q.companyName || '—',
      status: q.status || 'Draft',
      grandTotal: Number.isFinite(q.grandTotal) ? q.grandTotal : 0,
      quotationDate: q.quotationDate || q.createdAt || '—',
    }));

    return {
      period: {
        key: period.key as UserDashboardPeriodKey,
        label: period.label,
        start: period.start,
        end: period.end,
      },
      kpis: {
        myLeads: filteredLeads.length,
        wonDeals: closedWonDeals.length,
        activeDeals: activeDeals.length,
        followUpsToday: followUps.filter((f) => f.kind !== 'meeting').length,
        quotations: filteredQuotations.length,
        tasksPending: pendingTasks.length,
        meetingsToday: followUps.filter((f) => f.kind === 'meeting').length,
        monthlyRevenue: periodRevenue,
      } satisfies UserDashboardKpis,
      assignedLeads: tableRows,
      todaysLeads: todaysLeads.map((l) => this.toLeadTableRow(l, undefined)),
      followUps,
      activities: filteredActivities,
      performance: {
        conversionPct,
        monthlyClosureRate: closureRate,
        completedTasks: completedTasks.length,
        targetProgressPct,
        closedDeals: closedWonDeals.length,
        pendingCalls: pendingTasks.filter((t) => /call/i.test(t.title)).length,
      } satisfies UserDashboardPerformance,
      statusSummary: this.buildStatusSummary(filteredLeads),
      activeDealDetails: activeDeals.map((d) => this.toDealDetail(d)),
      wonDealDetails: closedWonDeals.map((d) => this.toDealDetail(d)),
      quotationDetails,
      pendingTaskDetails: pendingTasks.map((t) => this.toTaskDetail(t)),
      monthlyRevenueDeals: closedWonDeals.map((d) => this.toRevenueDealDetail(d)),
    };
  }

  private isDateInPeriod(date: Date, start: Date, end: Date): boolean {
    const t = date.getTime();
    return t >= start.getTime() && t <= end.getTime();
  }

  private toDealDetail(deal: DealRow): UserDashboardDealDetail {
    return {
      id: deal.id,
      dealName: dealDisplayName(deal),
      company: deal.organizationName?.trim() || '—',
      status: deal.status,
      value: Number.isFinite(deal.dealAmount) && deal.dealAmount > 0 ? deal.dealAmount : 0,
    };
  }

  private toTaskDetail(task: TaskRow): UserDashboardTaskDetail {
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.trim() || '—',
    };
  }

  private toRevenueDealDetail(deal: DealRow): UserDashboardRevenueDealDetail {
    return {
      id: deal.id,
      dealName: dealDisplayName(deal),
      company: deal.organizationName?.trim() || '—',
      value: Number.isFinite(deal.dealAmount) && deal.dealAmount > 0 ? deal.dealAmount : 0,
      closedDate: deal.lastModified?.trim() || '—',
    };
  }

  private buildStatusSummary(leads: LeadRow[]): UserDashboardLeadStatusSummary[] {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const key = l.status || 'New';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = leads.length || 1;
    return [...counts.entries()]
      .map(([status, count]) => ({
        status,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }

  private buildFollowUps(
    tasks: TaskRow[],
    periodStart: Date,
    periodEnd: Date,
  ): UserDashboardFollowUpItem[] {
    const now = new Date();
    const today = startOfDay(now);
    const endToday = endOfDay(now);
    const items: UserDashboardFollowUpItem[] = [];

    for (const t of tasks) {
      if (t.status === 'Done' || t.status === 'Canceled') continue;
      const due = parseDashboardDate(t.dueDateRaw || t.dueDate);
      if (!due) continue;

      const isMeeting = /meeting|review|demo/i.test(t.title);
      // Include items due today/overdue or within the selected active period
      const inPeriodOrToday = (due <= endToday) || (due >= periodStart && due <= periodEnd);
      if (!inPeriodOrToday && !isMeeting) continue;

      items.push({
        id: t.id,
        title: t.title,
        dueLabel: this.formatDueLabel(due, today),
        kind: due < today ? 'overdue' : isMeeting ? 'meeting' : 'upcoming',
      });
    }

    return items.sort((a, b) => {
      const order = { overdue: 0, upcoming: 1, meeting: 2 };
      return order[a.kind] - order[b.kind];
    });
  }

  private toDashboardActivityItem(
    row: ActivityRow,
    entityNames: Map<string, string>,
  ): UserDashboardActivityItem {
    const action = row.actionType.toLowerCase();
    let type: UserDashboardActivityItem['type'] = 'status';
    if (action.includes('call')) type = 'call';
    else if (action.includes('meeting')) type = 'meeting';
    else if (action.includes('task')) type = 'task';
    else if (action.includes('note') || action.includes('comment')) type = 'note';

    return {
      id: `activity-${row.id}`,
      type,
      title: row.message,
      subtitle: `${activityEntityDisplayLabel(row.entityType, row.entityId, entityNames)} · ${row.actorName}`,
      timeLabel: row.whenLabel,
    };
  }

  private buildLeadNextFollowUpMap(tasks: TaskRow[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (!t.relatedLeadId || t.status === 'Done' || t.status === 'Canceled') continue;
      const due = t.dueDateRaw || t.dueDate;
      const prev = map.get(t.relatedLeadId);
      if (!prev || due < prev) map.set(t.relatedLeadId, due);
    }
    return map;
  }

  private toLeadTableRow(lead: LeadRow, nextFollowUp?: string): UserDashboardLeadTableRow {
    return {
      id: lead.id,
      leadName: this.leadDisplayName(lead),
      company: lead.organization || '—',
      status: lead.status,
      priority: this.leadPriorityLabel(lead),
      assignedDate: lead.updated || '—',
      nextFollowUp: nextFollowUp?.trim() ? this.formatShortDate(nextFollowUp) : '—',
      source: lead.source?.trim() || lead.leadSource || 'Manual',
    };
  }

  private leadDisplayName(lead: LeadRow): string {
    const full = lead.name?.trim();
    if (full) return full;
    const parts = [lead.firstName, lead.lastName].map((p) => p?.trim()).filter(Boolean);
    return parts.length ? parts.join(' ') : 'Unnamed lead';
  }

  private leadPriorityLabel(lead: LeadRow): string {
    switch (lead.status) {
      case 'Qualified':
      case 'Converted':
        return 'High';
      case 'Contacted':
        return 'Medium';
      case 'Lost':
        return 'Low';
      default:
        return lead.requestType?.trim() ? lead.requestType : 'Normal';
    }
  }

  private formatShortDate(raw: string): string {
    const d = parseDashboardDate(raw);
    if (!d) return raw;
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  }

  private formatDueLabel(due: Date, today: Date): string {
    const start = startOfDay(today).getTime();
    const d0 = startOfDay(due).getTime();
    if (d0 < start) return 'Overdue';
    if (d0 === start) return 'Today';
    return this.formatShortDate(due.toISOString());
  }
}

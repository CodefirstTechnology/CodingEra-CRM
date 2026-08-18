import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, Subscription, take } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import type { RoleListItem } from '../../../core/auth/permission.models';
import { CrmEntityCacheService } from '../../../core/services/crm-entity-cache.service';
import type { AdminUserRow } from '../../../core/services/admin-users.service';
import { RbacService } from '../../../core/services/rbac.service';
import { ActivitiesService } from '../../../core/services/activities.service';
import type { ActivityRow } from '../../../core/services/activities/activity-api.models';
import { DealMasterSelectService } from '../../../core/services/deals/deal-master-select.service';
import type { MasterDataOption } from '../../../core/services/leads/lead-master-data.service';
import { isDealClosedWon } from '../../../core/services/deals/deal-pipeline.constants';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import {
  EmployeeTodayStats,
  UserSessionTrackerService,
} from '../../../core/services/user-session-tracker.service';
import { UserStatusSignalRService } from '../../../core/services/user-status-signalr.service';
import {
  activityEntityDisplayLabel,
  buildActivityEntityNameMap,
} from '../../../shared/utils/activity-entity-display.util';
import { formatInrCompact } from '../../../shared/utils/format-inr.util';
import type {
  AdminActivityStreamItem,
  AdminDashboardPeriodKey,
  AdminDealDetail,
  AdminLeadDetail,
} from '../models/admin-dashboard.models';
import { ADMIN_DASHBOARD_PERIOD_OPTIONS } from '../models/admin-dashboard.models';
import {
  dealDisplayName,
  dealOwnerLabel,
  dealRecordDate,
  isDateInRange,
  leadDisplayName,
  leadOwnerLabel,
  leadRecordDate,
  ownerKeyFromDeal,
  ownerKeyFromLead,
  parseDashboardDate,
  resolveDashboardPeriod,
  resolveDealValue,
  formatRelativeTime,
} from '../utils/admin-dashboard.util';

export interface EmployeeLedgerItem {
  userId: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarBg: string;
  lastActive: string;
  isOnline: boolean;
  isActive: boolean;
  firstLoginTimeLabel?: string;
  totalLeads: number;
  dealsClosedWon: number;
  wonRevenue: number;
  activitiesCount: number;
}

function getEmployeeInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (!parts.length || !parts[0]) return 'EP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #0ea5e9, #0284c7)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ec4899, #db2777)',
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'linear-gradient(135deg, #14b8a6, #0d9488)',
  'linear-gradient(135deg, #f97316, #ea580c)',
];

function getAvatarBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

@Component({
  selector: 'app-employee-performance',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './employee-performance.component.html',
  styleUrl: './employee-performance.component.scss',
})
export class EmployeePerformanceComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly entityCache = inject(CrmEntityCacheService);
  private readonly auth = inject(AuthService);
  private readonly rbac = inject(RbacService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly dealMaster = inject(DealMasterSelectService);
  private readonly sessionTracker = inject(UserSessionTrackerService);
  private readonly userStatusSignalR = inject(UserStatusSignalRService);

  private signalRSub: Subscription | null = null;

  protected readonly periodOptions = ADMIN_DASHBOARD_PERIOD_OPTIONS;
  protected readonly formatMoney = formatInrCompact;

  protected readonly userId = signal<string>('');
  /** Default period is "today" */
  protected readonly periodKey = signal<AdminDashboardPeriodKey>('today');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly cachedUsers = signal<AdminUserRow[]>([]);
  protected readonly teamRoles = signal<RoleListItem[]>([]);
  protected readonly rawLeads = signal<LeadRow[]>([]);
  protected readonly rawDeals = signal<DealRow[]>([]);
  protected readonly rawActivities = signal<ActivityRow[]>([]);
  protected readonly pipelineStatuses = signal<readonly MasterDataOption[]>([]);

  protected readonly activeTab = signal<'activities' | 'leads' | 'deals'>('activities');
  protected readonly itemSearchQuery = signal('');

  /** Current Selected Period date bounds */
  protected readonly currentPeriod = computed(() => {
    return resolveDashboardPeriod(this.periodKey(), new Date());
  });

  /** Specific User Object */
  protected readonly currentUser = computed<AdminUserRow | null>(() => {
    const uid = this.userId();
    if (!uid) return null;
    return this.cachedUsers().find((u) => u.id === uid || String(u.id) === String(uid)) ?? null;
  });

  /** All Activities for this user across history */
  protected readonly allUserActivities = computed<AdminActivityStreamItem[]>(() => {
    const uid = this.userId();
    const uObj = this.currentUser();
    const name = uObj?.name || `Employee #${uid}`;
    const email = uObj?.email || '';

    const raw = this.rawActivities();
    const entityNames = buildActivityEntityNameMap(this.rawLeads(), this.rawDeals());

    const userRows = raw.filter(
      (a) =>
        (a.actorUserId != null && String(a.actorUserId) === String(uid)) ||
        a.actorName?.toLowerCase() === name.toLowerCase() ||
        (email && a.actorName?.toLowerCase() === email.toLowerCase()),
    );

    return userRows.map((row) => this.toActivityStreamItem(row, entityNames));
  });

  /** Real-Time Today Stats: First Login, Last Active, Working Hours */
  protected readonly todayStats = computed<EmployeeTodayStats>(() => {
    const uid = this.userId();
    if (!uid) {
      return {
        isLoggedInToday: false,
        firstLoginTime: null,
        firstLoginTimeLabel: '--',
        lastActiveTime: null,
        lastActiveTimeLabel: 'Never active',
        workingHoursLabel: '0h 0m',
        isOnline: false,
        statusLabel: 'Offline',
      };
    }

    const acts = this.allUserActivities();
    const uObj = this.currentUser();
    return this.sessionTracker.computeTodayStats(uid, acts, uObj);
  });

  /** Activities strictly filtered by selected period */
  protected readonly periodActivities = computed<AdminActivityStreamItem[]>(() => {
    const period = this.currentPeriod();
    const all = this.allUserActivities();
    return all.filter((a) => {
      const d = a.createdAt ? new Date(a.createdAt) : parseDashboardDate(a.timeLabel);
      return d != null && isDateInRange(d, period.start, period.end);
    });
  });

  /** Tab 1: Activities list with real-time search */
  protected readonly employeeActivities = computed<AdminActivityStreamItem[]>(() => {
    const periodActs = this.periodActivities();
    const query = this.itemSearchQuery().trim().toLowerCase();
    if (!query) return periodActs;
    return periodActs.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.company.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.kind.toLowerCase().includes(query) ||
        a.timeLabel.toLowerCase().includes(query),
    );
  });

  /** Leads strictly filtered by selected period */
  protected readonly periodLeads = computed<AdminLeadDetail[]>(() => {
    const uid = this.userId();
    const uObj = this.currentUser();
    const name = uObj?.name || `Employee #${uid}`;
    const email = uObj?.email || '';

    const period = this.currentPeriod();
    const allLeads = this.rawLeads();

    const userLeads = allLeads.filter((l) => {
      const owner = leadOwnerLabel(l);
      const ownerId = ownerKeyFromLead(l);
      return (
        ownerId === uid ||
        owner.toLowerCase() === name.toLowerCase() ||
        (email && owner.toLowerCase() === email.toLowerCase())
      );
    });

    return userLeads
      .filter((l) => {
        const d = leadRecordDate(l);
        return d != null && isDateInRange(d, period.start, period.end);
      })
      .map((l) => ({
        id: l.id,
        name: leadDisplayName(l),
        company: l.organization?.trim() || '—',
        status: l.status || 'New',
        owner: leadOwnerLabel(l),
      }));
  });

  /** Tab 2: Leads list with real-time search */
  protected readonly employeeLeads = computed<AdminLeadDetail[]>(() => {
    const leads = this.periodLeads();
    const query = this.itemSearchQuery().trim().toLowerCase();
    if (!query) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        l.company.toLowerCase().includes(query) ||
        l.status.toLowerCase().includes(query) ||
        l.owner.toLowerCase().includes(query),
    );
  });

  /** Deals strictly filtered by selected period */
  protected readonly periodDeals = computed<AdminDealDetail[]>(() => {
    const uid = this.userId();
    const uObj = this.currentUser();
    const name = uObj?.name || `Employee #${uid}`;
    const email = uObj?.email || '';

    const period = this.currentPeriod();
    const allDeals = this.rawDeals();

    const userDeals = allDeals.filter((d) => {
      const owner = dealOwnerLabel(d);
      const ownerId = ownerKeyFromDeal(d);
      return (
        ownerId === uid ||
        owner.toLowerCase() === name.toLowerCase() ||
        (email && owner.toLowerCase() === email.toLowerCase())
      );
    });

    return userDeals
      .filter((d) => {
        const recordDate = dealRecordDate(d);
        return recordDate != null && isDateInRange(recordDate, period.start, period.end);
      })
      .map((d) => ({
        id: d.id,
        dealName: dealDisplayName(d),
        company: d.organizationName?.trim() || '—',
        owner: dealOwnerLabel(d),
        ownerUserId: uid,
        stage: d.status?.trim() || '—',
        value: resolveDealValue(d),
      }));
  });

  /** Tab 3: Deals list with real-time search */
  protected readonly employeeDeals = computed<AdminDealDetail[]>(() => {
    const deals = this.periodDeals();
    const query = this.itemSearchQuery().trim().toLowerCase();
    if (!query) return deals;
    return deals.filter(
      (d) =>
        d.dealName.toLowerCase().includes(query) ||
        d.company.toLowerCase().includes(query) ||
        d.stage.toLowerCase().includes(query) ||
        d.owner.toLowerCase().includes(query) ||
        String(d.value).includes(query),
    );
  });

  /** Employee Profile & KPI Summary */
  protected readonly employee = computed<EmployeeLedgerItem | null>(() => {
    const uid = this.userId();
    if (!uid) return null;

    const uObj = this.currentUser();
    const roles = this.teamRoles();
    const rObj = uObj?.roleId ? roles.find((r) => r.id === uObj.roleId) : null;
    const name = uObj?.name || `Employee #${uid}`;
    const email = uObj?.email || '';
    const role = uObj?.role || rObj?.name || 'Sales Representative';

    const pActs = this.periodActivities();
    const pLeads = this.periodLeads();
    const pDeals = this.periodDeals();
    const pipelineOpts = this.pipelineStatuses();

    const wonDealsInPeriod = pDeals.filter((d) => isDealClosedWon(d.stage, pipelineOpts));
    const wonRevenue = wonDealsInPeriod.reduce((sum, d) => sum + d.value, 0);

    const totalLeads = pLeads.length;
    const dealsClosedWon = wonDealsInPeriod.length;
    const activitiesCount = pActs.length;

    const stats = this.todayStats();
    const isOnline = stats.isOnline;
    const isActive = isOnline || stats.isLoggedInToday;

    return {
      userId: uid,
      name,
      email,
      role,
      initials: getEmployeeInitials(name),
      avatarBg: getAvatarBg(name),
      lastActive: stats.lastActiveTimeLabel,
      isOnline,
      isActive,
      firstLoginTimeLabel: stats.firstLoginTimeLabel,
      totalLeads,
      dealsClosedWon,
      wonRevenue,
      activitiesCount,
    };
  });

  constructor() {
    void this.userStatusSignalR.start();

    this.signalRSub = this.userStatusSignalR.userStatusChanged$.subscribe((evt) => {
      if (!evt?.userId) return;
      const uidStr = String(evt.userId).trim();

      this.cachedUsers.update((users) =>
        users.map((u) => {
          if (String(u.id).trim() === uidStr) {
            return {
              ...u,
              isOnline: evt.isOnline,
              lastActiveAt: evt.lastActiveAt !== undefined ? evt.lastActiveAt : u.lastActiveAt,
              firstLoginAt: evt.firstLoginAt !== undefined ? evt.firstLoginAt : u.firstLoginAt,
            };
          }
          return u;
        }),
      );
    });

    this.route.paramMap.subscribe((params) => {
      const id = params.get('userId');
      if (id && id !== this.userId()) {
        this.userId.set(id);
        this.loadPerformanceData();
      }
    });

    this.route.queryParamMap.subscribe((qp) => {
      const p = (qp.get('period') as AdminDashboardPeriodKey) || 'today';
      if (p !== this.periodKey()) {
        this.periodKey.set(p);
      }
      if (!this.cachedUsers().length && !this.loading()) {
        this.loadPerformanceData();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.signalRSub) {
      this.signalRSub.unsubscribe();
      this.signalRSub = null;
    }
  }

  protected setPeriod(key: AdminDashboardPeriodKey): void {
    if (this.periodKey() === key) return;
    this.periodKey.set(key);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period: key },
      queryParamsHandling: 'merge',
    });
  }

  protected onSearchInput(val: string): void {
    this.itemSearchQuery.set(val);
  }

  protected goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  private loadPerformanceData(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      roles: this.rbac
        .listRoles(this.auth.token(), { activeOnly: true })
        .pipe(catchError(() => of([] as RoleListItem[]))),
      users: this.entityCache
        .listUsers(true)
        .pipe(catchError(() => of([] as AdminUserRow[]))),
      leads: this.entityCache
        .listLeads()
        .pipe(catchError(() => of([] as LeadRow[]))),
      deals: this.entityCache
        .listDeals()
        .pipe(catchError(() => of([] as DealRow[]))),
      activities: this.activitiesService
        .getRecentFeed(100)
        .pipe(catchError(() => of([] as ActivityRow[]))),
      pipelineStatuses: this.dealMaster
        .ensureStatusesLoaded()
        .pipe(catchError(() => of([] as readonly MasterDataOption[]))),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ roles, users, leads, deals, activities, pipelineStatuses }) => {
          this.teamRoles.set(roles);
          this.cachedUsers.set(users);
          this.rawLeads.set(leads);
          this.rawDeals.set(deals);
          this.rawActivities.set(activities);
          this.pipelineStatuses.set(pipelineStatuses);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load performance records.');
        },
      });
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
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
    };
  }

  protected activityKindLabel(item: AdminActivityStreamItem): string {
    switch (item.kind) {
      case 'call':
        return 'Call';
      case 'meeting':
        return 'Meeting';
      case 'email':
        return 'Email';
      case 'lead':
        return 'Lead';
      case 'deal':
        return 'Deal';
      case 'item':
        return 'Item';
      default:
        return 'Activity';
    }
  }

  protected activityKindClass(item: AdminActivityStreamItem): string {
    return `emp-perf__tag emp-perf__tag--${item.kind}`;
  }
}

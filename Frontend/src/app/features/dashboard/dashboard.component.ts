import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { catchError, forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_ID_ADMIN } from '../../core/auth/auth-role.util';
import type { RoleListItem } from '../../core/auth/permission.models';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { RbacService } from '../../core/services/rbac.service';
import { formatInrCompact } from '../../shared/utils/format-inr.util';
import { CrmEntityCacheService } from '../../core/services/crm-entity-cache.service';
import type { AdminUserRow } from '../../core/services/admin-users.service';
import type {
  AdminActivityStreamItem,
  AdminDashboardPeriodKey,
  AdminDashboardSnapshot,
  AdminDashboardTeamFilters,
  AdminDealDetail,
  AdminLeadDetail,
  AdminPipelineSegment,
  AdminTeamLeadStatusFilter,
  AdminTeamMemberStats,
  AdminTeamRoleFilter,
  AdminTeamSortKey,
} from './models/admin-dashboard.models';
import {
  ADMIN_DASHBOARD_PERIOD_OPTIONS,
  ADMIN_TEAM_LEAD_STATUS_OPTIONS,
} from './models/admin-dashboard.models';
import { AdminDashboardService } from './services/admin-dashboard.service';
import {
  isAdminRoleLabel,
  resolveDefaultSalesTeamRoleFilter,
  sortTeamMembers,
  PIPELINE_STAGE_PREVIEW_LIMIT,
  STUCK_DEAL_PREVIEW_LIMIT,
  startOfDay,
  endOfDay,
} from './utils/admin-dashboard.util';

type StreamTab = 'all' | 'calls' | 'meetings';
type DetailKind = 'deals' | 'leads' | 'targets' | 'pipeline';

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInputValue(value: string): Date | null {
  const s = value?.trim();
  if (!s) return null;
  const t = Date.parse(`${s}T00:00:00`);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

const PIPELINE_STAGE_COLORS = [
  'var(--sd-accent)',
  '#2563eb',
  '#7c3aed',
  '#0891b2',
  '#059669',
  '#d97706',
] as const;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CrmModalComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly entityCache = inject(CrmEntityCacheService);
  private readonly auth = inject(AuthService);
  private readonly rbac = inject(RbacService);

  protected readonly periodOptions = ADMIN_DASHBOARD_PERIOD_OPTIONS;
  protected readonly teamLeadStatusOptions = ADMIN_TEAM_LEAD_STATUS_OPTIONS;
  protected readonly stuckPreviewLimit = STUCK_DEAL_PREVIEW_LIMIT;
  protected readonly pipelinePreviewLimit = PIPELINE_STAGE_PREVIEW_LIMIT;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly snapshot = signal<AdminDashboardSnapshot | null>(null);
  protected readonly periodKey = signal<AdminDashboardPeriodKey>('this_month');
  protected readonly periodMenuOpen = signal(false);
  protected readonly customPickerOpen = signal(false);
  protected readonly customStartInput = signal(toDateInputValue(startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1))));
  protected readonly customEndInput = signal(toDateInputValue(endOfDay(new Date())));
  protected readonly customRangeError = signal<string | null>(null);

  protected readonly periodLabel = computed(() => {
    const key = this.periodKey();
    if (key === 'custom') {
      const data = this.snapshot();
      if (data?.period.key === 'custom') return data.period.label;
      return 'Custom date range';
    }
    return this.periodOptions.find((o) => o.key === key)?.label ?? 'This month';
  });

  protected readonly teamSortKey = signal<AdminTeamSortKey>('qualifiedLeads');
  protected readonly teamSortDesc = signal(true);
  protected readonly teamRoleFilter = signal<AdminTeamRoleFilter>('all');
  protected readonly teamLeadStatusFilter = signal<AdminTeamLeadStatusFilter>('all');
  protected readonly teamRoles = signal<RoleListItem[]>([]);

  protected readonly teamRoleOptions = computed(() => {
    const roles = this.teamRoles().filter(
      (r) => r.isActive && r.id !== ROLE_ID_ADMIN && !isAdminRoleLabel(r.name),
    );
    return [
      { value: 'all' as const, label: 'All roles' },
      ...roles.map((r) => ({ value: r.id as number, label: r.name })),
    ];
  });

  protected readonly teamRoleFilterLabel = computed(() => {
    const current = this.teamRoleFilter();
    if (current === 'all') return 'All roles';
    return this.teamRoleOptions().find((o) => o.value === current)?.label ?? 'All roles';
  });

  protected readonly teamLeadStatusLabel = computed(() => {
    const current = this.teamLeadStatusFilter();
    return (
      this.teamLeadStatusOptions.find((o) => o.value === current)?.label ?? 'All statuses'
    );
  });

  protected readonly streamTab = signal<StreamTab>('all');
  protected readonly STREAM_INITIAL_COUNT = 10;
  protected readonly streamExpanded = signal(false);

  protected readonly gaugeCircumference = 2 * Math.PI * 46;
  protected readonly formatMoney = formatInrCompact;

  protected readonly detailOpen = signal(false);
  protected readonly detailTitle = signal('');
  protected readonly detailKind = signal<DetailKind>('deals');
  protected readonly detailDeals = signal<AdminDealDetail[]>([]);
  protected readonly detailLeads = signal<AdminLeadDetail[]>([]);
  protected readonly detailTeam = signal<AdminTeamMemberStats[]>([]);
  protected readonly detailPipeline = signal<AdminPipelineSegment[]>([]);

  /** Stages that currently have at least one open deal — full list for modals. */
  protected readonly pipelineActiveSegments = computed(() => {
    const segments = this.snapshot()?.pipelineSegments ?? [];
    return [...segments].filter((s) => s.count > 0).sort((a, b) => b.revenue - a.revenue);
  });

  /** Top pipeline stages shown on the dashboard card. */
  protected readonly pipelineCardSegments = computed(() =>
    this.pipelineActiveSegments().slice(0, this.pipelinePreviewLimit),
  );

  protected readonly pipelineCardHiddenCount = computed(() =>
    Math.max(0, this.pipelineActiveSegments().length - this.pipelinePreviewLimit),
  );

  protected readonly pipelineEmptyStageCount = computed(() => {
    const segments = this.snapshot()?.pipelineSegments ?? [];
    return segments.filter((s) => s.count === 0).length;
  });

  constructor() {
    this.loadTeamRolesAndDashboard();
  }

  private loadTeamRolesAndDashboard(): void {
    forkJoin({
      roles: this.rbac
        .listRoles(this.auth.token(), { activeOnly: true })
        .pipe(catchError(() => of([] as RoleListItem[]))),
      users: this.entityCache
        .listUsers()
        .pipe(catchError(() => of([] as AdminUserRow[]))),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ roles, users }) => {
          this.teamRoles.set(roles);
          this.teamRoleFilter.set(resolveDefaultSalesTeamRoleFilter(roles, users));
          this.refreshDashboard();
        },
        error: () => {
          this.teamRoles.set([]);
          this.refreshDashboard();
        },
      });
  }

  protected onTeamRoleFilterChange(raw: string): void {
    const next: AdminTeamRoleFilter = raw === 'all' ? 'all' : Number(raw);
    if (next !== 'all' && (!Number.isFinite(next) || next <= 0)) return;
    if (this.teamRoleFilter() === next) return;
    this.teamRoleFilter.set(next);
    this.refreshDashboard();
  }

  protected onTeamLeadStatusFilterChange(raw: string): void {
    const next = raw as AdminTeamLeadStatusFilter;
    if (this.teamLeadStatusFilter() === next) return;
    this.teamLeadStatusFilter.set(next);
    this.refreshDashboard();
  }

  protected teamRoleSelectValue(role: AdminTeamRoleFilter): string {
    return role === 'all' ? 'all' : `${role}`;
  }

  protected teamRoleOptionValue(value: AdminTeamRoleFilter | number): string {
    return value === 'all' ? 'all' : `${value}`;
  }

  private teamFilters(): AdminDashboardTeamFilters {
    return {
      roleId: this.teamRoleFilter(),
      leadStatus: this.teamLeadStatusFilter(),
    };
  }

  protected togglePeriodMenu(): void {
    this.periodMenuOpen.update((open) => {
      const next = !open;
      if (!next) {
        this.customPickerOpen.set(false);
        this.customRangeError.set(null);
      }
      return next;
    });
  }

  protected closePeriodMenu(): void {
    this.periodMenuOpen.set(false);
    this.customPickerOpen.set(false);
    this.customRangeError.set(null);
  }

  protected selectPeriod(key: AdminDashboardPeriodKey): void {
    if (key === 'custom') {
      this.customPickerOpen.set(true);
      this.customRangeError.set(null);
      return;
    }
    if (this.periodKey() === key) {
      this.closePeriodMenu();
      return;
    }
    this.periodKey.set(key);
    this.closePeriodMenu();
    this.refreshDashboard();
  }

  protected onCustomStartChange(value: string): void {
    this.customStartInput.set(value);
    this.customRangeError.set(null);
  }

  protected onCustomEndChange(value: string): void {
    this.customEndInput.set(value);
    this.customRangeError.set(null);
  }

  protected applyCustomRange(): void {
    const start = parseDateInputValue(this.customStartInput());
    const end = parseDateInputValue(this.customEndInput());
    if (!start || !end) {
      this.customRangeError.set('Select both start and end dates.');
      return;
    }
    if (startOfDay(start).getTime() > startOfDay(end).getTime()) {
      this.customRangeError.set('Start date must be on or before end date.');
      return;
    }
    this.periodKey.set('custom');
    this.customRangeError.set(null);
    this.periodMenuOpen.set(false);
    this.customPickerOpen.set(false);
    this.refreshDashboard();
  }

  protected refreshDashboard(): void {
    this.closePeriodMenu();
    this.entityCache.invalidate();
    this.loading.set(true);
    this.error.set(null);
    this.streamExpanded.set(false);

    const key = this.periodKey();
    const customRange =
      key === 'custom'
        ? {
            start: parseDateInputValue(this.customStartInput()) ?? startOfDay(new Date()),
            end: parseDateInputValue(this.customEndInput()) ?? endOfDay(new Date()),
          }
        : null;

    this.dashboardService
      .loadSnapshot(key, customRange, this.teamFilters())
      .pipe(take(1))
      .subscribe({
        next: ({ data, error }) => {
          this.loading.set(false);
          this.snapshot.set(data);
          this.error.set(error);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load dashboard.');
        },
      });
  }

  protected setTeamSort(key: AdminTeamSortKey): void {
    if (this.teamSortKey() === key) {
      this.teamSortDesc.update((d) => !d);
    } else {
      this.teamSortKey.set(key);
      this.teamSortDesc.set(true);
    }
  }

  protected teamSortIndicator(key: AdminTeamSortKey): string {
    if (this.teamSortKey() !== key) return '';
    return this.teamSortDesc() ? ' ↓' : ' ↑';
  }

  protected readonly sortedTeam = computed(() => {
    const data = this.snapshot();
    if (!data) return [];
    return sortTeamMembers(data.team, this.teamSortKey(), this.teamSortDesc());
  });

  protected readonly stuckDealsPreview = computed(() => {
    const rows = this.snapshot()?.stuckDeals ?? [];
    return rows.slice(0, this.stuckPreviewLimit);
  });

  protected readonly stuckDealsHiddenCount = computed(() => {
    const total = this.snapshot()?.stuckDeals.length ?? 0;
    return Math.max(0, total - this.stuckPreviewLimit);
  });

  protected targetRemaining(kpis: AdminDashboardSnapshot['kpis']): number {
    return Math.max(0, kpis.periodTarget - kpis.periodAchieved);
  }

  protected gaugeDashOffset(): number {
    const pct = this.snapshot()?.kpis.targetAchievedPct ?? 0;
    return this.gaugeCircumference * (1 - pct / 100);
  }

  protected readonly conversionBars = computed(() => {
    const k = this.snapshot()?.kpis;
    const empty = [
      { label: 'Leads', ratio: 0 },
      { label: 'Won', ratio: 0 },
      { label: 'Ratio', ratio: 0 },
    ];
    if (!k || k.totalLeads === 0) return empty;

    const raw = [
      { label: 'Leads', value: k.totalLeads },
      { label: 'Won', value: k.wonDeals },
      { label: 'Ratio', value: k.conversionRatePct },
    ];
    const max = Math.max(...raw.map((r) => r.value), 1);

    return raw.map((r) => ({
      label: r.label,
      ratio: r.value === 0 ? 0 : Math.max(0.08, r.value / max),
    }));
  });

  /** Bar height inside the conversion SVG viewBox (max 56). */
  protected conversionBarHeight(ratio: number): number {
    return Math.max(4, Math.round(ratio * 56));
  }

  protected setStreamTab(tab: StreamTab): void {
    this.streamTab.set(tab);
    this.streamExpanded.set(false);
  }

  protected readonly filteredActivities = computed(() => {
    const list = this.snapshot()?.activities ?? [];
    const tab = this.streamTab();
    if (tab === 'all') return list;
    if (tab === 'calls') return list.filter((a) => a.kind === 'call');
    return list.filter((a) => a.kind === 'meeting');
  });

  protected readonly visibleActivities = computed(() => {
    const list = this.filteredActivities();
    if (this.streamExpanded()) return list;
    return list.slice(0, this.STREAM_INITIAL_COUNT);
  });

  protected readonly streamHiddenCount = computed(() =>
    Math.max(0, this.filteredActivities().length - this.STREAM_INITIAL_COUNT),
  );

  protected readonly showStreamSeeMore = computed(
    () => !this.streamExpanded() && this.streamHiddenCount() > 0,
  );

  protected readonly showStreamShowLess = computed(
    () => this.streamExpanded() && this.filteredActivities().length > this.STREAM_INITIAL_COUNT,
  );

  protected expandStream(): void {
    this.streamExpanded.set(true);
  }

  protected collapseStream(): void {
    this.streamExpanded.set(false);
  }

  protected pipelineStageColor(index: number): string {
    return PIPELINE_STAGE_COLORS[index % PIPELINE_STAGE_COLORS.length];
  }

  protected openDealDetails(title: string, deals: AdminDealDetail[]): void {
    this.detailKind.set('deals');
    this.detailTitle.set(title);
    this.detailDeals.set(deals);
    this.detailLeads.set([]);
    this.detailTeam.set([]);
    this.detailPipeline.set([]);
    this.detailOpen.set(true);
  }

  protected openLeadDetails(title: string, leads: AdminLeadDetail[]): void {
    this.detailKind.set('leads');
    this.detailTitle.set(title);
    this.detailLeads.set(leads);
    this.detailDeals.set([]);
    this.detailTeam.set([]);
    this.detailPipeline.set([]);
    this.detailOpen.set(true);
  }

  protected openTargetDetails(): void {
    const data = this.snapshot();
    if (!data) return;
    this.detailKind.set('targets');
    this.detailTitle.set(`Sales targets (${data.period.label.toLowerCase()})`);
    this.detailTeam.set(data.team.filter((t) => t.targetAmount > 0 || t.targetAchieved > 0));
    this.detailDeals.set([]);
    this.detailLeads.set([]);
    this.detailPipeline.set([]);
    this.detailOpen.set(true);
  }

  protected openPipelineBreakdown(): void {
    const data = this.snapshot();
    if (!data) return;
    this.detailKind.set('pipeline');
    this.detailTitle.set('All pipeline stages');
    this.detailPipeline.set(data.pipelineSegments);
    this.detailDeals.set([]);
    this.detailLeads.set([]);
    this.detailTeam.set([]);
    this.detailOpen.set(true);
  }

  protected closeDetail(): void {
    this.detailOpen.set(false);
  }

  protected openKpiLeads(filter: 'all' | 'qualified' | 'converted' | 'new'): void {
    const data = this.snapshot();
    if (!data) return;

    if (filter === 'all' || filter === 'new') {
      this.openLeadDetails(`Leads (${data.period.label.toLowerCase()})`, data.leadDetails);
      return;
    }
    if (filter === 'qualified') {
      this.openLeadDetails(
        'Qualified leads',
        data.leadDetails.filter((l) => l.status === 'Qualified'),
      );
      return;
    }
    this.openLeadDetails(
      'Converted leads',
      data.leadDetails.filter((l) => l.status === 'Converted'),
    );
  }

  protected openWonDeals(): void {
    const data = this.snapshot();
    if (!data) return;
    this.openDealDetails(
      `Won deals (${data.period.label.toLowerCase()})`,
      data.wonDealDetails,
    );
  }

  protected openPipelineOverview(): void {
    const data = this.snapshot();
    if (!data) return;
    this.openDealDetails(
      `Open pipeline (${data.kpis.activePipelineCount} deals)`,
      data.openDealDetails,
    );
  }

  protected openPipelineSegment(label: string, deals: AdminDealDetail[]): void {
    this.openDealDetails(`${label} (${deals.length})`, deals);
  }

  protected openStuckDealsAll(): void {
    const data = this.snapshot();
    if (!data) return;
    const deals: AdminDealDetail[] = data.stuckDeals.map((d) => ({
      id: d.id,
      dealName: d.dealName,
      company: d.company,
      owner: d.owner,
      ownerUserId: '',
      stage: d.stage,
      value: d.revenue,
      inactiveHours: d.inactiveHours,
    }));
    this.openDealDetails(`Stuck deals (${deals.length})`, deals);
  }

  protected openTeamMemberDeals(userId: string, name: string): void {
    const data = this.snapshot();
    if (!data) return;
    const deals = data.openDealDetails.filter((d) => d.ownerUserId === userId);
    this.openDealDetails(`${name} — open deals (${deals.length})`, deals);
  }

  protected targetGap(row: AdminTeamMemberStats): number {
    return Math.max(0, row.targetAmount - row.targetAchieved);
  }

  protected activityKindLabel(item: AdminActivityStreamItem): string {
    switch (item.kind) {
      case 'lead':
        return 'Lead';
      case 'deal':
        return 'Deal';
      case 'item':
        return 'Item Master';
      case 'task':
        return 'Task';
      case 'call':
        return 'Call';
      case 'meeting':
        return 'Meeting';
      case 'email':
        return 'Email';
      default:
        return 'Activity';
    }
  }

  protected activityKindClass(item: AdminActivityStreamItem): string {
    if (item.kind === 'lead') return 'sales-dash__entity-tag sales-dash__entity-tag--lead';
    if (item.kind === 'deal') return 'sales-dash__entity-tag sales-dash__entity-tag--deal';
    if (item.kind === 'item') return 'sales-dash__entity-tag sales-dash__entity-tag--item';
    return 'sales-dash__entity-tag';
  }
}

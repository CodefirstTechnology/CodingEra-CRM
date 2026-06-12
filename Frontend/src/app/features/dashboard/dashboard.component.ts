import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { formatInrCompact } from '../../shared/utils/format-inr.util';
import { CrmEntityCacheService } from '../../core/services/crm-entity-cache.service';
import type {
  AdminActivityStreamItem,
  AdminDashboardPeriodKey,
  AdminDashboardSnapshot,
  AdminDealDetail,
  AdminLeadDetail,
  AdminPipelineSegment,
  AdminTeamMemberStats,
  AdminTeamSortKey,
} from './models/admin-dashboard.models';
import { ADMIN_DASHBOARD_PERIOD_OPTIONS } from './models/admin-dashboard.models';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { sortTeamMembers, STUCK_DEAL_PREVIEW_LIMIT } from './utils/admin-dashboard.util';

type StreamTab = 'all' | 'calls' | 'meetings';
type DetailKind = 'deals' | 'leads' | 'targets' | 'pipeline';

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
  imports: [RouterLink, CrmModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly entityCache = inject(CrmEntityCacheService);

  protected readonly periodOptions = ADMIN_DASHBOARD_PERIOD_OPTIONS;
  protected readonly stuckPreviewLimit = STUCK_DEAL_PREVIEW_LIMIT;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly snapshot = signal<AdminDashboardSnapshot | null>(null);
  protected readonly periodKey = signal<AdminDashboardPeriodKey>('this_month');
  protected readonly periodMenuOpen = signal(false);

  protected readonly periodLabel = computed(() => {
    const key = this.periodKey();
    return this.periodOptions.find((o) => o.key === key)?.label ?? 'This month';
  });

  protected readonly teamSortKey = signal<AdminTeamSortKey>('qualifiedLeads');
  protected readonly teamSortDesc = signal(true);

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

  /** Stages that currently have at least one open deal — shown on the card. */
  protected readonly pipelineActiveSegments = computed(() => {
    const segments = this.snapshot()?.pipelineSegments ?? [];
    return [...segments].filter((s) => s.count > 0).sort((a, b) => b.revenue - a.revenue);
  });

  protected readonly pipelineEmptyStageCount = computed(() => {
    const segments = this.snapshot()?.pipelineSegments ?? [];
    return segments.filter((s) => s.count === 0).length;
  });

  constructor() {
    this.refreshDashboard();
  }

  protected togglePeriodMenu(): void {
    this.periodMenuOpen.update((open) => !open);
  }

  protected closePeriodMenu(): void {
    this.periodMenuOpen.set(false);
  }

  protected selectPeriod(key: AdminDashboardPeriodKey): void {
    if (this.periodKey() === key) {
      this.closePeriodMenu();
      return;
    }
    this.periodKey.set(key);
    this.closePeriodMenu();
    this.refreshDashboard();
  }

  protected refreshDashboard(): void {
    this.closePeriodMenu();
    this.entityCache.invalidate();
    this.loading.set(true);
    this.error.set(null);
    this.streamExpanded.set(false);
    this.dashboardService
      .loadSnapshot(this.periodKey())
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
    if (!k || k.totalLeads === 0) {
      return [
        { label: 'Qual', pct: 0 },
        { label: 'Conv', pct: 0 },
        { label: 'New', pct: 0 },
      ];
    }
    const total = k.totalLeads;
    return [
      { label: 'Qual', pct: Math.min(100, Math.round((k.qualifiedLeads / total) * 100)) },
      { label: 'Conv', pct: Math.min(100, Math.round((k.convertedLeads / total) * 100)) },
      {
        label: 'New',
        pct: Math.min(100, Math.round((k.newLeadsInPeriod / total) * 100)),
      },
    ];
  });

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

    if (filter === 'all') {
      this.openLeadDetails('All leads', data.leadDetails);
      return;
    }
    if (filter === 'qualified') {
      this.openLeadDetails(
        'Qualified leads',
        data.leadDetails.filter((l) => l.status === 'Qualified'),
      );
      return;
    }
    if (filter === 'converted') {
      this.openLeadDetails(
        'Converted leads',
        data.leadDetails.filter((l) => l.status === 'Converted'),
      );
      return;
    }
    this.openLeadDetails(
      `New leads (${data.period.label.toLowerCase()})`,
      data.newLeadDetails,
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
    return 'sales-dash__entity-tag';
  }
}

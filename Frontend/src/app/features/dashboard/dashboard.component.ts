import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { formatUsdAsInr } from '../../shared/utils/format-inr.util';
import { MorningBriefingVoiceService } from '../user-dashboard/services/morning-briefing-voice.service';
import type {
  AdminActivityStreamItem,
  AdminDashboardSnapshot,
  AdminTeamSortKey,
} from './models/admin-dashboard.models';
import { AuthService } from '../../core/auth/auth.service';
import { CrmEntityCacheService } from '../../core/services/crm-entity-cache.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { sortTeamMembers } from './utils/admin-dashboard.util';

type StreamTab = 'all' | 'calls' | 'meetings';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly entityCache = inject(CrmEntityCacheService);
  protected readonly briefing = inject(MorningBriefingVoiceService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly snapshot = signal<AdminDashboardSnapshot | null>(null);

  protected readonly teamSortKey = signal<AdminTeamSortKey>('qualifiedLeads');
  protected readonly teamSortDesc = signal(true);

  protected readonly streamTab = signal<StreamTab>('all');
  protected readonly STREAM_INITIAL_COUNT = 10;
  protected readonly streamExpanded = signal(false);

  protected readonly gaugeCircumference = 2 * Math.PI * 46;
  protected readonly formatMoney = formatUsdAsInr;

  protected readonly briefingBusy = computed(
    () => this.briefing.state() === 'loading' || this.briefing.state() === 'speaking',
  );

  constructor() {
    this.briefing.loadPreferences();
    this.refreshDashboard();
  }

  ngOnDestroy(): void {
    this.briefing.stop();
  }

  protected refreshDashboard(): void {
    this.entityCache.invalidate();
    this.loading.set(true);
    this.error.set(null);
    this.streamExpanded.set(false);
    this.dashboardService
      .loadSnapshot()
      .pipe(take(1))
      .subscribe({
        next: ({ data, metrics, error }) => {
          this.loading.set(false);
          this.snapshot.set(data);
          this.error.set(error);
          if (data && metrics && !error) {
            this.briefing.setDailyMetrics({
              ...metrics,
              adminName: this.adminBriefingName(),
            });
            this.briefing.tryAutoPlayAfterDashboardLoad();
          }
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

  protected gaugeDashOffset(): number {
    const pct = this.snapshot()?.kpis.monthlyTargetAchievedPct ?? 0;
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
      { label: 'New', pct: Math.min(100, Math.round((k.newLeadsThisMonth / total) * 100)) },
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

  protected playBriefing(): void {
    this.briefing.playNow();
  }

  private adminBriefingName(): string {
    const name = this.auth.user()?.name?.trim();
    if (!name) return 'Admin';
    return name.split(/\s+/)[0] || 'Admin';
  }

  protected activityKindClass(item: AdminActivityStreamItem): string {
    if (item.kind === 'lead') return 'sales-dash__entity-tag sales-dash__entity-tag--lead';
    if (item.kind === 'deal') return 'sales-dash__entity-tag sales-dash__entity-tag--deal';
    return 'sales-dash__entity-tag';
  }
}

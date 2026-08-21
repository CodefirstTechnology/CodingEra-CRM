import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { roleDisplayLabel } from '../../core/auth/auth-role.util';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { PermissionService } from '../../core/services/permission.service';
import type { UserTargetWidget } from '../../core/services/user-targets/user-target-api.models';
import { UserTargetHttpService } from '../../core/services/user-targets/user-target-http.service';
import { CrmPaginationFooterComponent } from '../../shared/components/crm-pagination-footer/crm-pagination-footer.component';
import {
  CRM_TABLE_DEFAULT_PAGE_SIZE,
  CRM_TABLE_PAGE_SIZE_OPTIONS,
} from '../../shared/components/crm-pagination-footer/crm-table-pagination.model';
import { createClientTablePagination } from '../../shared/utils/crm-table-pagination.util';
import { UserSessionTrackerService } from '../../core/services/user-session-tracker.service';
import {
  endOfDay,
  startOfDay,
  startOfMonth,
} from '../dashboard/utils/admin-dashboard.util';
import {
  formatIndianCurrency,
} from '../../shared/utils/format-inr.util';
import {
  USER_DASHBOARD_PERIOD_OPTIONS,
  type UserDashboardCustomRange,
  type UserDashboardFollowUpItem,
  type UserDashboardKpiDetailKind,
  type UserDashboardPeriodKey,
  type UserDashboardSnapshot,
} from './models/user-dashboard.models';
import { UserDashboardService } from './services/user-dashboard.service';

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

function formatShortDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, FormsModule, CrmPaginationFooterComponent, CrmModalComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.scss',
})
export class UserDashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(UserDashboardService);
  private readonly createFlow = inject(CreateFlowService);
  private readonly permissions = inject(PermissionService);
  private readonly userTargets = inject(UserTargetHttpService);
  private readonly sessionTracker = inject(UserSessionTrackerService);
  private readonly router = inject(Router);

  protected readonly periodOptions = USER_DASHBOARD_PERIOD_OPTIONS;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly snapshot = signal<UserDashboardSnapshot | null>(null);
  protected readonly targetWidgets = signal<UserTargetWidget[]>([]);
  protected readonly targetsLoading = signal(false);

  // Period filter state signals
  protected readonly periodKey = signal<UserDashboardPeriodKey>('this_month');
  protected readonly periodMenuOpen = signal(false);
  protected readonly customPickerOpen = signal(false);
  protected readonly customStartInput = signal(toDateInputValue(startOfMonth(new Date())));
  protected readonly customEndInput = signal(toDateInputValue(endOfDay(new Date())));
  protected readonly customRangeError = signal<string | null>(null);
  protected readonly customRange = signal<UserDashboardCustomRange | null>(null);

  protected readonly showTargets = computed(() =>
    this.permissions.hasAny(['user_targets.view', 'user_targets.manage', 'settings.manage']),
  );

  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => roleDisplayLabel(this.user()));
  protected readonly today = new Date();

  protected readonly motivationalLine = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Start strong — your pipeline is waiting.';
    if (hour < 17) return 'Keep momentum on follow-ups and deals.';
    return 'Close the day with one more meaningful touchpoint.';
  });

  protected readonly periodLabel = computed(() => {
    const key = this.periodKey();
    if (key === 'custom') {
      const snap = this.snapshot();
      if (snap?.period.key === 'custom') return snap.period.label;
      const cr = this.customRange();
      if (cr) return `${formatShortDate(cr.start)} – ${formatShortDate(cr.end)}`;
      return 'Custom range';
    }
    return this.periodOptions.find((o) => o.key === key)?.label ?? 'This month';
  });

  protected readonly hasActiveFilters = computed(() => {
    return this.periodKey() !== 'this_month' || this.customRange() != null;
  });

  private readonly activitiesData = computed(() => this.snapshot()?.activities ?? []);
  private readonly followUpsData = computed(() => this.snapshot()?.followUps ?? []);
  private readonly todaysLeadsData = computed(() => this.snapshot()?.todaysLeads ?? []);

  protected readonly activitiesPagination = createClientTablePagination(this.activitiesData);
  protected readonly followUpsPagination = createClientTablePagination(this.followUpsData, {
    defaultPageSize: CRM_TABLE_DEFAULT_PAGE_SIZE,
  });
  protected readonly todaysLeadsPagination = createClientTablePagination(this.todaysLeadsData, {
    defaultPageSize: CRM_TABLE_DEFAULT_PAGE_SIZE,
  });

  protected readonly dashboardPageSizeOptions = CRM_TABLE_PAGE_SIZE_OPTIONS;

  protected readonly kpiDetailOpen = signal(false);
  protected readonly kpiDetailKind = signal<UserDashboardKpiDetailKind>('leads');
  protected readonly kpiDetailTitle = signal('');

  protected readonly kpiFollowUpsToday = computed(() =>
    (this.snapshot()?.followUps ?? []).filter((f) => f.kind !== 'meeting'),
  );

  protected readonly kpiMeetingsToday = computed(() =>
    (this.snapshot()?.followUps ?? []).filter((f) => f.kind === 'meeting'),
  );

  constructor() {
    this.refresh();
  }

  protected refresh(): void {
    this.sessionTracker.sendHeartbeat(true);
    this.loading.set(true);
    this.error.set(null);
    this.dashboard
      .loadSnapshot({
        periodKey: this.periodKey(),
        customRange: this.customRange(),
      })
      .pipe(take(1))
      .subscribe({
        next: ({ data, error }) => {
          this.loading.set(false);
          this.snapshot.set(data);
          this.error.set(error);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load your dashboard.');
        },
      });
    this.loadTargetWidgets();
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

  protected selectPeriod(key: UserDashboardPeriodKey): void {
    if (key === 'custom') {
      this.customPickerOpen.set(true);
      this.customRangeError.set(null);
      return;
    }
    if (this.periodKey() === key && !this.customRange()) {
      this.closePeriodMenu();
      return;
    }
    this.periodKey.set(key);
    this.customRange.set(null);
    this.closePeriodMenu();
    this.refresh();
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
    this.customRange.set({ start, end });
    this.customRangeError.set(null);
    this.periodMenuOpen.set(false);
    this.customPickerOpen.set(false);
    this.refresh();
  }

  protected resetFilters(): void {
    this.periodKey.set('this_month');
    this.customRange.set(null);
    this.closePeriodMenu();
    this.refresh();
  }

  private loadTargetWidgets(): void {
    if (!this.showTargets()) {
      this.targetWidgets.set([]);
      return;
    }
    this.targetsLoading.set(true);
    this.userTargets.listMyWidgets().pipe(take(1)).subscribe({
      next: (rows) => {
        this.targetWidgets.set(rows);
        this.targetsLoading.set(false);
      },
      error: () => {
        this.targetWidgets.set([]);
        this.targetsLoading.set(false);
      },
    });
  }

  protected openCreate(kind: 'lead' | 'deal' | 'task'): void {
    this.createFlow.selectEntity(kind);
  }

  protected readonly targetDonutCircumference = 238.76;

  protected getDonutOffset(achievementPercent: number): number {
    const pct = Math.max(0, Math.min(100, achievementPercent || 0));
    return this.targetDonutCircumference * (1 - pct / 100);
  }

  protected formatRevenue(value: number): string {
    return formatIndianCurrency(value);
  }

  protected openKpiDetail(kind: UserDashboardKpiDetailKind): void {
    const data = this.snapshot();
    if (!data) return;

    const titles: Record<UserDashboardKpiDetailKind, string> = {
      leads: `Total leads (${data.kpis.myLeads})`,
      deals: `Active deals (${data.kpis.activeDeals})`,
      wonDeals: `Won deals (${data.kpis.wonDeals})`,
      followUps: `Follow-ups (${data.kpis.followUpsToday})`,
      followUpsAll: `Follow-ups & meetings (${data.followUps.length})`,
      quotations: `Quotations (${data.kpis.quotations})`,
      tasks: `Tasks pending (${data.kpis.tasksPending})`,
      meetings: `Meetings (${data.kpis.meetingsToday})`,
      revenue: `Revenue in period (${this.formatRevenue(data.kpis.monthlyRevenue)})`,
    };

    this.kpiDetailKind.set(kind);
    this.kpiDetailTitle.set(titles[kind]);
    this.kpiDetailOpen.set(true);
  }

  protected closeKpiDetail(): void {
    this.kpiDetailOpen.set(false);
  }

  protected openFollowUpsPanel(): void {
    const data = this.snapshot();
    if (!data) return;
    this.kpiDetailKind.set('followUpsAll');
    this.kpiDetailTitle.set(`Follow-ups & meetings (${data.followUps.length})`);
    this.kpiDetailOpen.set(true);
  }

  protected openFollowUp(item: UserDashboardFollowUpItem, ev?: Event): void {
    ev?.stopPropagation();
    const taskId = item.id?.trim();
    if (!taskId) return;
    this.closeKpiDetail();
    void this.router.navigate(['/tasks'], {
      queryParams: { edit: taskId },
    });
  }

  protected openTaskById(taskId: string, ev?: Event): void {
    ev?.stopPropagation();
    const id = taskId?.trim();
    if (!id) return;
    this.closeKpiDetail();
    void this.router.navigate(['/tasks'], {
      queryParams: { edit: id },
    });
  }
}

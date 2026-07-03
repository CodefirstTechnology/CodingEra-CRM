import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { roleDisplayLabel } from '../../core/auth/auth-role.util';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { PermissionService } from '../../core/services/permission.service';
import type { UserTargetWidget } from '../../core/services/user-targets/user-target-api.models';
import { UserTargetHttpService } from '../../core/services/user-targets/user-target-http.service';
import { CrmPaginationFooterComponent } from '../../shared/components/crm-pagination-footer/crm-pagination-footer.component';
import {
  CRM_TABLE_DEFAULT_PAGE_SIZE,
  CRM_TABLE_PAGE_SIZE_OPTIONS,
} from '../../shared/components/crm-pagination-footer/crm-table-pagination.model';
import { createClientTablePagination } from '../../shared/utils/crm-table-pagination.util';
import type { UserDashboardSnapshot } from './models/user-dashboard.models';
import { UserDashboardService } from './services/user-dashboard.service';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, CrmPaginationFooterComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.scss',
})
export class UserDashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(UserDashboardService);
  private readonly createFlow = inject(CreateFlowService);
  private readonly permissions = inject(PermissionService);
  private readonly userTargets = inject(UserTargetHttpService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly snapshot = signal<UserDashboardSnapshot | null>(null);
  protected readonly targetWidgets = signal<UserTargetWidget[]>([]);
  protected readonly targetsLoading = signal(false);

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

  private readonly assignedLeadsData = computed(() => this.snapshot()?.assignedLeads ?? []);
  private readonly activitiesData = computed(() => this.snapshot()?.activities ?? []);
  private readonly followUpsData = computed(() => this.snapshot()?.followUps ?? []);
  private readonly todaysLeadsData = computed(() => this.snapshot()?.todaysLeads ?? []);

  protected readonly assignedLeadsPagination = createClientTablePagination(this.assignedLeadsData);
  protected readonly activitiesPagination = createClientTablePagination(this.activitiesData);
  protected readonly followUpsPagination = createClientTablePagination(this.followUpsData, {
    defaultPageSize: CRM_TABLE_DEFAULT_PAGE_SIZE,
  });
  protected readonly todaysLeadsPagination = createClientTablePagination(this.todaysLeadsData, {
    defaultPageSize: CRM_TABLE_DEFAULT_PAGE_SIZE,
  });

  protected readonly dashboardPageSizeOptions = CRM_TABLE_PAGE_SIZE_OPTIONS;

  constructor() {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.dashboard
      .loadSnapshot()
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

  protected scheduleMeeting(): void {
    this.createFlow.selectEntity('task');
  }

  protected formatRevenue(value: number): string {
    if (value >= 1_000_000) return `₹${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
    return `₹${Math.round(value)}`;
  }
}

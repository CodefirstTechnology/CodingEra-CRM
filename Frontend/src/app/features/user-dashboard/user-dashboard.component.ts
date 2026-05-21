import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { roleDisplayLabel } from '../../core/auth/auth-role.util';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import type { UserDashboardSnapshot } from './models/user-dashboard.models';
import { UserDashboardService } from './services/user-dashboard.service';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.scss',
})
export class UserDashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(UserDashboardService);
  private readonly createFlow = inject(CreateFlowService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly snapshot = signal<UserDashboardSnapshot | null>(null);

  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => roleDisplayLabel(this.user()));
  protected readonly today = new Date();

  protected readonly motivationalLine = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Start strong — your pipeline is waiting.';
    if (hour < 17) return 'Keep momentum on follow-ups and deals.';
    return 'Close the day with one more meaningful touchpoint.';
  });

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

import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ActivitiesService } from '../../core/services/activities.service';
import type { ActivityRow } from '../../core/services/activities/activity-api.models';
import { DealsService } from '../../core/services/deals.service';
import { LeadsService } from '../../core/services/leads.service';
import {
  activityEntityDisplayLabel,
  buildActivityEntityNameMap,
} from '../../shared/utils/activity-entity-display.util';
import { formatUsdAsInr } from '../../shared/utils/format-inr.util';

type ActivityType = 'call' | 'meeting' | 'email' | 'task';
type StreamTab = 'all' | 'calls' | 'meetings';

interface StreamActivityItem {
  type: ActivityType;
  title: string;
  company: string;
  description: string;
  time: string;
  rep: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);

  protected readonly periodOptions = ['Q4 2024', 'Q3 2024', 'Q2 2024', 'Q1 2024'] as const;

  protected readonly filterForm = this.fb.nonNullable.group({
    period: ['Q4 2024', Validators.required],
  });

  protected readonly formatInr = formatUsdAsInr;

  protected readonly monthlyTarget = {
    achievedPct: 75,
    currentUsd: 750_000,
    targetUsd: 1_000_000,
  };

  protected readonly conversion = {
    rate: '24.8%',
    delta: '+4.2%',
    /** Mon–Sun bar heights (% of track); all different, intentionally not sorted. */
    weeklyBarHeights: [84, 29, 71, 45, 93, 38, 56],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  };

  protected readonly revenueForecast = {
    totalUsd: 4_120_000,
    confidence: 'High (92%)',
    segments: [
      { label: 'Enterprise', usd: 2_200_000, pct: 53 },
      { label: 'Mid-Market', usd: 1_400_000, pct: 34 },
      { label: 'SMB', usd: 500_000, pct: 13 },
    ],
  };

  protected readonly quarterlyProgress = {
    currentUsd: 2_400_000,
    goalUsd: 3_000_000,
  };

  protected streamTab: StreamTab = 'all';
  protected readonly activities = signal<StreamActivityItem[]>([]);
  protected readonly activitiesLoading = signal(true);

  ngOnInit(): void {
    forkJoin({
      leads: this.leadsService.getAll().pipe(catchError(() => of([]))),
      deals: this.dealsService.getAll().pipe(catchError(() => of([]))),
    })
      .pipe(
        map(({ leads, deals }) => ({
          leadIds: leads
            .map((l) => Number(l.id))
            .filter((n) => Number.isFinite(n) && n > 0),
          dealIds: deals
            .map((d) => Number(d.id))
            .filter((n) => Number.isFinite(n) && n > 0),
          entityNames: buildActivityEntityNameMap(leads, deals),
        })),
        catchError(() =>
          of({
            leadIds: [] as number[],
            dealIds: [] as number[],
            entityNames: new Map<string, string>(),
          }),
        ),
      )
      .subscribe(({ leadIds, dealIds, entityNames }) => {
        this.activitiesService.getRecentForRecords(leadIds, dealIds, 20).subscribe({
          next: (rows) => {
            this.activities.set(rows.map((row) => this.toStreamItem(row, entityNames)));
            this.activitiesLoading.set(false);
          },
          error: () => {
            this.activities.set([]);
            this.activitiesLoading.set(false);
          },
        });
      });
  }

  protected setStreamTab(tab: StreamTab): void {
    this.streamTab = tab;
  }

  protected get filteredActivities(): StreamActivityItem[] {
    const list = this.activities();
    if (this.streamTab === 'all') return list;
    if (this.streamTab === 'calls') return list.filter((a) => a.type === 'call');
    return list.filter((a) => a.type === 'meeting');
  }

  protected readonly stuckDeals = [
    {
      company: 'Sterling Freight Co.',
      stage: 'Proposal Sent',
      inactiveDays: 14,
      valueUsd: 410_000,
      action: 'Trigger Nudge Sequence',
    },
    {
      company: 'Blue Ridge Labs',
      stage: 'Negotiation',
      inactiveDays: 9,
      valueUsd: 285_000,
      action: 'Schedule Executive Sync',
    },
    {
      company: 'Harborline Retail',
      stage: 'Discovery',
      inactiveDays: 21,
      valueUsd: 132_000,
      action: 'Escalate to Manager',
    },
  ];

  /** SVG circle length for gauge (viewBox r=46). */
  protected readonly gaugeCircumference = 2 * Math.PI * 46;

  /** Dash offset so only achievedPct of the ring is visible (stroke from top). */
  protected gaugeDashOffset(): number {
    return this.gaugeCircumference * (1 - this.monthlyTarget.achievedPct / 100);
  }

  private toStreamItem(row: ActivityRow, entityNames: Map<string, string>): StreamActivityItem {
    const action = row.actionType.toLowerCase();
    let type: ActivityType = 'task';
    if (action.includes('call')) type = 'call';
    else if (action.includes('meeting')) type = 'meeting';
    else if (action.includes('email') || action.includes('mail')) type = 'email';

    const description =
      row.fieldName && (row.oldValue != null || row.newValue != null)
        ? `${row.fieldName}: ${row.oldValue ?? '—'} → ${row.newValue ?? '—'}`
        : row.message;

    return {
      type,
      title: row.message,
      company: activityEntityDisplayLabel(row.entityType, row.entityId, entityNames),
      description,
      time: row.whenLabel,
      rep: row.actorName,
    };
  }
}

import { Component } from '@angular/core';

type ActivityType = 'call' | 'meeting' | 'email' | 'task';
type StreamTab = 'all' | 'calls' | 'meetings';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly periodLabel = 'Q4 2024';

  protected readonly monthlyTarget = {
    achievedPct: 75,
    current: '$750k',
    target: '$1.0M',
  };

  protected readonly conversion = {
    rate: '24.8%',
    delta: '+4.2%',
    /** Heights 0–100 for Mon–Sun bars */
    weeklyBars: [72, 48, 88, 56, 92, 64, 78],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  };

  protected readonly revenueForecast = {
    total: '$4.12M',
    confidence: 'High (92%)',
    segments: [
      { label: 'Enterprise', value: '$2.2M', pct: 53 },
      { label: 'Mid-Market', value: '$1.4M', pct: 34 },
      { label: 'SMB', value: '$0.5M', pct: 13 },
    ],
  };

  protected readonly quarterlyProgress = {
    current: '$2.4M',
    goal: '$3.0M',
  };

  protected streamTab: StreamTab = 'all';

  protected setStreamTab(tab: StreamTab): void {
    this.streamTab = tab;
  }

  protected readonly activities: {
    type: ActivityType;
    title: string;
    company: string;
    description: string;
    time: string;
    rep: string;
  }[] = [
      {
        type: 'call',
        title: 'Call with',
        company: 'Global Logistics Corp',
        description: 'Initial discovery call — 45 mins',
        time: '10:24 AM',
        rep: 'Alex Rivera',
      },
      {
        type: 'meeting',
        title: 'Quarterly review',
        company: 'Northwind Trading',
        description: 'Executive alignment — quarterly targets',
        time: 'Yesterday',
        rep: 'Jordan Lee',
      },
      {
        type: 'email',
        title: 'Proposal sent',
        company: 'Acme Industries',
        description: 'Enterprise licensing package',
        time: 'Yesterday',
        rep: 'Sam Carter',
      },
      {
        type: 'task',
        title: 'Follow-up task',
        company: 'Globex Systems',
        description: 'Pricing approval checkpoint',
        time: 'Mon',
        rep: 'Alex Rivera',
      },
      {
        type: 'call',
        title: 'Call with',
        company: 'Initech Partners',
        description: 'Renewal discussion — 30 mins',
        time: 'Mon',
        rep: 'Priya Shah',
      },
    ];

  protected get filteredActivities(): typeof this.activities {
    if (this.streamTab === 'all') return this.activities;
    if (this.streamTab === 'calls') return this.activities.filter((a) => a.type === 'call');
    return this.activities.filter((a) => a.type === 'meeting');
  }

  protected readonly stuckDeals = [
    {
      company: 'Sterling Freight Co.',
      stage: 'Proposal Sent',
      inactiveDays: 14,
      value: '$410K',
      action: 'Trigger Nudge Sequence',
    },
    {
      company: 'Blue Ridge Labs',
      stage: 'Negotiation',
      inactiveDays: 9,
      value: '$285K',
      action: 'Schedule Executive Sync',
    },
    {
      company: 'Harborline Retail',
      stage: 'Discovery',
      inactiveDays: 21,
      value: '$132K',
      action: 'Escalate to Manager',
    },
  ];

  /** SVG circle length for gauge (viewBox r=46). */
  protected readonly gaugeCircumference = 2 * Math.PI * 46;

  /** Dash offset so only achievedPct of the ring is visible (stroke from top). */
  protected gaugeDashOffset(): number {
    return this.gaugeCircumference * (1 - this.monthlyTarget.achievedPct / 100);
  }
}

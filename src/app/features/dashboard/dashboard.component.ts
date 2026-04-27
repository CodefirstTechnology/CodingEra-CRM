import { Component, signal } from '@angular/core';

type ActivityTab = 'all' | 'calls' | 'meetings';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly periodLabel = 'Q3 2024';

  protected readonly activeTab = signal<ActivityTab>('all');

  protected setTab(t: ActivityTab): void {
    this.activeTab.set(t);
  }

  protected readonly activities: {
    type: 'call' | 'meeting' | 'mail' | 'calendar';
    kind: 'call' | 'meeting' | 'other';
    title: string;
    titleBold: string;
    desc: string;
    time: string;
    rep: string;
  }[] = [
    {
      type: 'call',
      kind: 'call',
      title: 'Call with ',
      titleBold: 'Global Logistics Corp',
      desc: 'Initial discovery call – 45 mins',
      time: 'Today, 10:30 AM',
      rep: 'J. Doe',
    },
    {
      type: 'meeting',
      kind: 'meeting',
      title: 'QBR with ',
      titleBold: 'Vertex Cloud Systems',
      desc: 'Executive alignment — next steps',
      time: 'Yesterday, 3:00 PM',
      rep: 'A. Rivera',
    },
    {
      type: 'mail',
      kind: 'other',
      title: 'Email — ',
      titleBold: 'Northwind Traders',
      desc: 'Pricing follow-up and timeline',
      time: 'Mon, 9:12 AM',
      rep: 'M. Chen',
    },
  ];

  protected filteredActivities() {
    const t = this.activeTab();
    if (t === 'calls') return this.activities.filter((a) => a.kind === 'call');
    if (t === 'meetings') return this.activities.filter((a) => a.kind === 'meeting');
    return this.activities;
  }

  protected readonly stuckDeals = [
    {
      name: 'Vertex Cloud Systems',
      stage: 'Proposal Sent',
      days: 14,
      value: '$124,500',
    },
    {
      name: 'Global Logistics Corp',
      stage: 'Negotiation',
      days: 21,
      value: '$89,200',
    },
    {
      name: 'Apex Materials Inc.',
      stage: 'Discovery',
      days: 9,
      value: '$42,000',
    },
  ];

  protected readonly forecastSegs = [
    { label: 'Enterprise', value: '$2.2M', pct: 78 },
    { label: 'Mid-Market', value: '$1.4M', pct: 55 },
    { label: 'SMB', value: '$0.5M', pct: 30 },
  ];

  protected readonly convBars = [42, 58, 48, 72, 64, 88, 52];

  /** Donut: 75% progress arc in theme blue */
  protected donutStyle(): string {
    return 'conic-gradient(var(--tertiary-color) 0% 75%, rgb(255 255 255 / 0.1) 75% 100%)';
  }
}

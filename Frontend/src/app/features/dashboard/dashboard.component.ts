import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly todayLabel = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  protected readonly stats = [
    { label: 'Open deals', value: '128', delta: '+12%', positive: true },
    { label: 'Pipeline value', value: '$2.4M', delta: '+4%', positive: true },
    { label: 'Win rate', value: '34%', delta: '-1%', positive: false },
    { label: 'Tasks due', value: '18', delta: 'Today', positive: true },
  ];

  protected readonly quickActions = [
    { label: 'Log a call', icon: 'phone' },
    { label: 'New task', icon: 'check' },
    { label: 'Send email', icon: 'mail' },
    { label: 'Schedule meeting', icon: 'calendar' },
  ] as const;

  protected readonly pipeline = [
    { stage: 'Qualification', count: 42, value: '$420K', widthPct: 18 },
    { stage: 'Proposal', count: 28, value: '$890K', widthPct: 26 },
    { stage: 'Negotiation', count: 15, value: '$1.1M', widthPct: 34 },
    { stage: 'Closed won', count: 9, value: '$640K', widthPct: 22 },
  ];

  protected readonly sources = [
    { name: 'Website', pct: 38, tone: 'a' },
    { name: 'Referral', pct: 27, tone: 'b' },
    { name: 'Campaign', pct: 21, tone: 'c' },
    { name: 'Other', pct: 14, tone: 'd' },
  ] as const;

  protected readonly recentDeals = [
    { name: 'Acme rollout', org: 'Acme Ltd', amount: '$185,000', stage: 'Negotiation', owner: 'SK' },
    { name: 'Northwind renewal', org: 'Northwind', amount: '$42,500', stage: 'Proposal', owner: 'AM' },
    { name: 'Globex pilot', org: 'Globex', amount: '$96,000', stage: 'Qualification', owner: 'JD' },
    { name: 'Initech expansion', org: 'Initech', amount: '$310,000', stage: 'Negotiation', owner: 'SK' },
    { name: 'Umbrella POC', org: 'Umbrella Corp', amount: '$18,200', stage: 'Qualification', owner: 'AM' },
  ];

  protected readonly tasks = [
    { title: 'Follow up — Acme legal review', due: 'Today · 4:00 PM', urgent: true },
    { title: 'Send pricing sheet — Globex', due: 'Tomorrow', urgent: false },
    { title: 'Prep QBR deck — Northwind', due: 'Fri', urgent: false },
    { title: 'Renewal reminder — Initech', due: 'Mon', urgent: true },
  ];

  protected readonly activity = [
    { text: 'Deal moved to Negotiation: Acme rollout', time: '32 min ago', type: 'deal' },
    { text: 'New lead captured from website form', time: '1 hr ago', type: 'lead' },
    { text: 'Task completed: Discovery call — Globex', time: '2 hrs ago', type: 'task' },
    { text: 'Note added on Northwind renewal', time: 'Yesterday', type: 'note' },
    { text: 'Meeting scheduled with Initech', time: 'Yesterday', type: 'calendar' },
  ] as const;

  protected readonly bars = [72, 48, 88, 56, 92, 64, 78];
  private readonly linePoints = [20, 45, 35, 62, 48, 70, 55, 80, 72, 90];

  private chartPoints(): { x: number; y: number }[] {
    const w = 400;
    const h = 120;
    const pad = 12;
    const n = this.linePoints.length;
    return this.linePoints.map((v, i) => ({
      x: n === 1 ? 0 : (i / (n - 1)) * w,
      y: h - pad - (v / 100) * (h - 2 * pad),
    }));
  }

  protected linePointsAttr(): string {
    return this.chartPoints()
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  }

  protected areaPath(): string {
    const pts = this.chartPoints();
    if (!pts.length) return '';
    const h = 120;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return `${d} L ${pts[pts.length - 1].x} ${h} L 0 ${h} Z`;
  }

  protected stageClass(stage: string): string {
    const s = stage.toLowerCase();
    if (s.includes('won') || s.includes('closed')) return 'tag tag--success';
    if (s.includes('negotiation')) return 'tag tag--accent';
    if (s.includes('proposal')) return 'tag tag--warn';
    return 'tag tag--muted';
  }

  /** Conic gradient for lead-source donut; uses theme chart tokens. */
  protected donutGradient(): string {
    let acc = 0;
    const cols = [
      'var(--chart-1)',
      'var(--chart-2)',
      'color-mix(in srgb, var(--chart-3) 75%, var(--tertiary-color))',
      'color-mix(in srgb, var(--text-muted) 65%, var(--surface))',
    ];
    const segs = this.sources.map((s, i) => {
      const from = acc;
      acc += s.pct;
      return `${cols[i]} ${from}% ${acc}%`;
    });
    return `conic-gradient(${segs.join(', ')})`;
  }
}

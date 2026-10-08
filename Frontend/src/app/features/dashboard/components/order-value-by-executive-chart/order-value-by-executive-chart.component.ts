import { Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AdminDealDetail, AdminTeamMemberStats } from '../../models/admin-dashboard.models';
import { formatInrCompact } from '../../../../shared/utils/format-inr.util';

export interface ExecutiveChartData {
  userId: string;
  name: string;
  email: string;
  orderValue: number;
  dealsCount: number;
  percentage: number;
  color: string;
  strokeDasharray: string;
  strokeDashoffset: number;
  formattedValue: string;
  formattedCompact: string;
  barHeightPct: number;
}

export type ChartTypeMode = 'bar' | 'pie';

const PALETTE = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6366F1', // Indigo
];

function getNiceMax(maxVal: number): number {
  if (maxVal <= 0) return 10000;
  const exp = Math.floor(Math.log10(maxVal));
  const frac = maxVal / Math.pow(10, exp);
  let niceFrac: number;
  if (frac <= 1) niceFrac = 1;
  else if (frac <= 1.5) niceFrac = 1.5;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 2.5) niceFrac = 2.5;
  else if (frac <= 5) niceFrac = 5;
  else niceFrac = 10;
  return niceFrac * Math.pow(10, exp);
}

@Component({
  selector: 'app-order-value-by-executive-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-value-by-executive-chart.component.html',
  styleUrl: './order-value-by-executive-chart.component.scss',
})
export class OrderValueByExecutiveChartComponent {
  teamStats = input<AdminTeamMemberStats[]>([]);
  wonDeals = input<AdminDealDetail[]>([]);
  loading = input<boolean>(false);

  chartMode = signal<ChartTypeMode>('bar');
  hoveredUserId = signal<string | null>(null);

  protected readonly CIRCUMFERENCE = 251.327; // 2 * PI * 40

  protected readonly formatMoneyInr = (val: number): string => {
    if (!Number.isFinite(val) || val === 0) return '₹ 0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  protected readonly formatCompactMoney = formatInrCompact;

  protected readonly executiveData = computed<ExecutiveChartData[]>(() => {
    const stats = this.teamStats() ?? [];
    const deals = this.wonDeals() ?? [];

    const dealsByOwner = new Map<string, { count: number; totalValue: number; name: string; email: string }>();

    for (const d of deals) {
      const ownerKey = d.ownerUserId?.trim() || d.owner?.trim() || 'Unassigned';
      const ownerName = d.owner?.trim() || 'Executive';
      const existing = dealsByOwner.get(ownerKey) || {
        count: 0,
        totalValue: 0,
        name: ownerName,
        email: '',
      };
      existing.count += 1;
      existing.totalValue += d.value || 0;
      dealsByOwner.set(ownerKey, existing);
    }

    for (const t of stats) {
      const key = t.userId?.trim() || t.name?.trim();
      const existing = dealsByOwner.get(key);
      const wonVal = t.monthlyRevenue > 0 ? t.monthlyRevenue : t.targetAchieved;
      if (!existing) {
        dealsByOwner.set(key, {
          count: t.dealsClosedWon || 0,
          totalValue: wonVal || 0,
          name: t.name,
          email: t.email || '',
        });
      } else {
        if (existing.count === 0 && t.dealsClosedWon > 0) {
          existing.count = t.dealsClosedWon;
        }
        if (existing.totalValue === 0 && wonVal > 0) {
          existing.totalValue = wonVal;
        }
        if (t.email && !existing.email) existing.email = t.email;
      }
    }

    const rawList = Array.from(dealsByOwner.entries()).map(([userId, data]) => ({
      userId,
      name: data.name,
      email: data.email,
      orderValue: data.totalValue,
      dealsCount: data.count,
    }));

    rawList.sort((a, b) => b.orderValue - a.orderValue || b.dealsCount - a.dealsCount);

    const totalVal = rawList.reduce((sum, item) => sum + item.orderValue, 0);
    const maxVal = Math.max(...rawList.map((item) => item.orderValue), 0);
    const niceMax = getNiceMax(maxVal);

    let cumulativeOffset = 0;
    const result: ExecutiveChartData[] = [];

    const topExecutives = rawList.slice(0, 10);
    const otherExecutives = rawList.slice(10);

    let listToRender = [...topExecutives];
    if (otherExecutives.length > 0) {
      const otherValue = otherExecutives.reduce((sum, item) => sum + item.orderValue, 0);
      const otherDeals = otherExecutives.reduce((sum, item) => sum + item.dealsCount, 0);
      if (otherValue > 0 || otherDeals > 0) {
        listToRender.push({
          userId: 'others',
          name: `Others (${otherExecutives.length})`,
          email: '',
          orderValue: otherValue,
          dealsCount: otherDeals,
        });
      }
    }

    listToRender.forEach((exec, idx) => {
      const pct = totalVal > 0 ? (exec.orderValue / totalVal) * 100 : 0;
      const segmentLen = (pct / 100) * this.CIRCUMFERENCE;
      const strokeDasharray = `${segmentLen.toFixed(3)} ${(this.CIRCUMFERENCE - segmentLen).toFixed(3)}`;
      const strokeDashoffset = -cumulativeOffset;
      cumulativeOffset += segmentLen;

      const barHeightPct = niceMax > 0 ? Math.min(100, Math.max(0, (exec.orderValue / niceMax) * 100)) : 0;

      result.push({
        ...exec,
        percentage: Math.round(pct * 10) / 10,
        color: PALETTE[idx % PALETTE.length],
        strokeDasharray,
        strokeDashoffset,
        formattedValue: this.formatMoneyInr(exec.orderValue),
        formattedCompact: formatInrCompact(exec.orderValue),
        barHeightPct,
      });
    });

    return result;
  });

  protected readonly totalOrderValue = computed(() =>
    this.executiveData().reduce((sum, item) => sum + item.orderValue, 0),
  );

  protected readonly totalWonDealsCount = computed(() =>
    this.executiveData().reduce((sum, item) => sum + item.dealsCount, 0),
  );

  protected readonly yAxisGridSteps = computed(() => {
    const maxVal = Math.max(...this.executiveData().map((item) => item.orderValue), 0);
    const niceMax = getNiceMax(maxVal);
    const steps: { value: number; label: string }[] = [];
    const count = 8;
    for (let i = count; i >= 0; i--) {
      const val = (niceMax / count) * i;
      steps.push({
        value: val,
        label: formatInrCompact(val),
      });
    }
    return steps;
  });

  protected readonly activeHoveredItem = computed(() => {
    const uid = this.hoveredUserId();
    if (!uid) return null;
    return this.executiveData().find((item) => item.userId === uid) ?? null;
  });

  setChartMode(mode: ChartTypeMode): void {
    this.chartMode.set(mode);
  }

  setHovered(userId: string | null): void {
    this.hoveredUserId.set(userId);
  }
}

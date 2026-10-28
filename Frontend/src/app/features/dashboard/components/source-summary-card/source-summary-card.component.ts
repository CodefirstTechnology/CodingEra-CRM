import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  DashboardService,
  SourceMonthlyTrend,
  SourceSummaryItem,
  SourceSummaryResponse,
} from '../../../../core/services/dashboard.service';

@Component({
  selector: 'app-source-summary-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './source-summary-card.component.html',
  styleUrl: './source-summary-card.component.scss',
})
export class SourceSummaryCardComponent {
  private readonly dashboardService = inject(DashboardService);

  /** Mode: 'embedded' (card on dashboard) or 'full' (modal with 12m table & charts) */
  readonly mode = input<'embedded' | 'full'>('embedded');

  readonly availableYears = [2024, 2025, 2026, 2027];
  readonly selectedYear = signal<number>(new Date().getFullYear());
  readonly selectedSource = signal<string>('All');
  readonly selectedMonth = signal<number>(0); // 0 = Whole Year, 1..12
  readonly loading = signal<boolean>(false);
  readonly reportData = signal<SourceSummaryResponse | null>(null);

  // Active highlighted source in chart/table
  readonly activeSourceRow = signal<string | null>(null);

  readonly monthsList = [
    { num: 0, label: 'All Months' },
    { num: 1, label: 'Jan' },
    { num: 2, label: 'Feb' },
    { num: 3, label: 'Mar' },
    { num: 4, label: 'Apr' },
    { num: 5, label: 'May' },
    { num: 6, label: 'Jun' },
    { num: 7, label: 'Jul' },
    { num: 8, label: 'Aug' },
    { num: 9, label: 'Sep' },
    { num: 10, label: 'Oct' },
    { num: 11, label: 'Nov' },
    { num: 12, label: 'Dec' },
  ];

  // Distinct palette for sources
  private readonly sourceColors: Record<string, string> = {
    indiamart: '#0ea5e9', // Blue
    justdial: '#f59e0b', // Amber/Orange
    tradeindia: '#10b981', // Emerald Green
    manual: '#6366f1', // Indigo
    website: '#8b5cf6', // Violet
    referral: '#ec4899', // Pink
    'cold outreach': '#14b8a6', // Teal
  };

  constructor() {
    effect(() => {
      const year = this.selectedYear();
      const source = this.selectedSource();
      this.fetchSummary(year, source);
    });
  }

  fetchSummary(year: number, source: string): void {
    this.loading.set(true);
    this.dashboardService
      .getSourcePerformanceSummary(year, source, undefined, undefined, new Date().getTimezoneOffset())
      .subscribe({
        next: (res) => {
          this.reportData.set(res);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  protected onYearChange(year: number): void {
    this.selectedYear.set(year);
  }

  protected onSourceChange(source: string): void {
    this.selectedSource.set(source);
  }

  protected onMonthChange(month: number): void {
    this.selectedMonth.set(month);
  }

  /** Sources available from backend or fallback */
  readonly configuredSources = computed<string[]>(() => {
    return this.reportData()?.configuredSources ?? [];
  });

  /** Filtered source items based on month filter (if specific month is selected) */
  readonly sourcesList = computed<SourceSummaryItem[]>(() => {
    const raw = this.reportData()?.sources ?? [];
    const monthlyTrends = this.reportData()?.monthlyTrends ?? [];
    const month = this.selectedMonth();

    if (month === 0) {
      return raw;
    }

    // Look up the specific month trend
    const mt = monthlyTrends.find((m) => m.monthNumber === month);
    const sourceLeadCounts = mt?.sourceLeadCounts ?? {};
    const sourceWonRevenues = mt?.sourceWonRevenues ?? {};

    const totalLeadsInMonth = Object.values(sourceLeadCounts).reduce((a, b) => a + b, 0);

    return raw.map((s) => {
      const leads = sourceLeadCounts[s.sourceName] ?? 0;
      const wonRev = sourceWonRevenues[s.sourceName] ?? 0;
      const share = totalLeadsInMonth > 0 ? Math.round((leads / totalLeadsInMonth) * 1000) / 10 : 0;

      // When filtering to a month where no leads exist for this source, show 0 for that month
      return {
        ...s,
        totalLeads: leads,
        wonRevenue: wonRev,
        shareOfTotalLeadsPercentage: share,
      };
    });
  });

  /** Totals calculated from visible sources */
  readonly currentTotals = computed(() => {
    const list = this.sourcesList();
    const totLeads = list.reduce((acc, s) => acc + s.totalLeads, 0);
    const totContacted = list.reduce((acc, s) => acc + s.contactedLeads, 0);
    const totQual = list.reduce((acc, s) => acc + s.qualifiedLeads, 0);
    const totQuotes = list.reduce((acc, s) => acc + s.quotationsCount, 0);
    const totWon = list.reduce((acc, s) => acc + s.wonOrdersCount, 0);
    const totLost = list.reduce((acc, s) => acc + s.lostCount, 0);
    const totOpen = list.reduce((acc, s) => acc + s.openCount, 0);
    const totLeadVal = list.reduce((acc, s) => acc + s.totalLeadValue, 0);
    const totQuoteVal = list.reduce((acc, s) => acc + s.totalQuotedValue, 0);
    const totWonRev = list.reduce((acc, s) => acc + s.totalWonRevenue, 0);

    const l2q = totLeads > 0 ? Math.round((totQuotes / totLeads) * 1000) / 10 : 0;
    const q2o = totQuotes > 0 ? Math.round((totWon / totQuotes) * 1000) / 10 : 0;
    const l2o = totLeads > 0 ? Math.round((totWon / totLeads) * 1000) / 10 : 0;

    return {
      totalLeads: totLeads,
      contactedLeads: totContacted,
      qualifiedLeads: totQual,
      quotationsCount: totQuotes,
      wonOrdersCount: totWon,
      lostCount: totLost,
      openCount: totOpen,
      totalLeadValue: totLeadVal,
      totalQuotedValue: totQuoteVal,
      totalWonRevenue: totWonRev,
      leadToQuotePercentage: l2q,
      quoteToOrderPercentage: q2o,
      leadToOrderPercentage: l2o,
    };
  });

  /** Maximum lead count across sources for proportional SVG bar sizing */
  readonly maxLeadCount = computed(() => {
    const list = this.sourcesList();
    if (!list.length) return 1;
    return Math.max(...list.map((s) => s.totalLeads), 1);
  });

  /** Monthly trends (1..12) for bar chart */
  readonly overallMonthlyTrends = computed(() => {
    const trends = this.reportData()?.monthlyTrends ?? [];
    if (trends.length > 0) {
      return trends.map((t) => ({
        month: t.monthNumber,
        label: t.monthLabel.split('-')[0] || t.monthLabel,
        leads: t.totalLeads,
        won: t.wonOrdersCount,
        rev: t.wonRevenue,
      }));
    }

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthLabels.map((l, i) => ({
      month: i + 1,
      label: l,
      leads: 0,
      won: 0,
      rev: 0,
    }));
  });

  readonly maxMonthlyTrendLead = computed(() => {
    const trends = this.overallMonthlyTrends();
    return Math.max(...trends.map((t) => t.leads), 1);
  });

  getSourceColor(sourceName: string): string {
    const key = (sourceName || '').toLowerCase().trim();
    return this.sourceColors[key] || '#64748b';
  }

  formatINR(val: number | undefined | null): string {
    if (val == null || !Number.isFinite(val)) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  }

  formatCompactINR(val: number | undefined | null): string {
    if (val == null || !Number.isFinite(val) || val === 0) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)} K`;
    return `₹${Math.round(val)}`;
  }

  formatPercent(val: number | undefined | null): string {
    if (val == null || !Number.isFinite(val)) return '0.0%';
    return `${val.toFixed(1)}%`;
  }

  getBadgeClass(val: number): string {
    if (val >= 50) return 'src-badge--success';
    if (val >= 20) return 'src-badge--warning';
    return 'src-badge--neutral';
  }

  exportToExcel(): void {
    const sources = this.sourcesList();
    const rows = sources.map((s) => ({
      Source: s.sourceName,
      'Total Leads': s.totalLeads,
      Contacted: s.contactedLeads,
      Qualified: s.qualifiedLeads,
      Quotations: s.quotationsCount,
      'Won Deals': s.wonOrdersCount,
      'Lost Deals': s.lostCount,
      'Won Revenue (₹)': s.totalWonRevenue,
      'Lead Share %': `${s.shareOfTotalLeadsPercentage}%`,
      'Lead -> Quote %': `${s.leadToQuotePercentage}%`,
      'Quote -> Order %': `${s.quoteToOrderPercentage}%`,
      'Lead -> Order %': `${s.conversionRate}%`,
    }));

    const tot = this.currentTotals();
    rows.push({
      Source: 'TOTALS',
      'Total Leads': tot.totalLeads,
      Contacted: tot.contactedLeads,
      Qualified: tot.qualifiedLeads,
      Quotations: tot.quotationsCount,
      'Won Deals': tot.wonOrdersCount,
      'Lost Deals': tot.lostCount,
      'Won Revenue (₹)': tot.totalWonRevenue,
      'Lead Share %': '100%',
      'Lead -> Quote %': `${tot.leadToQuotePercentage}%`,
      'Quote -> Order %': `${tot.quoteToOrderPercentage}%`,
      'Lead -> Order %': `${tot.leadToOrderPercentage}%`,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Source Summary');
    XLSX.writeFile(wb, `Source_Performance_Summary_${this.selectedYear()}.xlsx`);
  }

  exportToPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const year = this.selectedYear();

    doc.setFontSize(14);
    doc.text(`CodingEra CRM - Lead Source Performance Summary (${year})`, 14, 15);

    const head = [
      [
        'Source',
        'Leads',
        'Contacted',
        'Qual.',
        'Quotes',
        'Won',
        'Lost',
        'Won Revenue (₹)',
        'Share %',
        'L->Q %',
        'Q->O %',
        'L->O %',
      ],
    ];

    const sources = this.sourcesList();
    const body: (string | number)[][] = sources.map((s) => [
      s.sourceName,
      s.totalLeads,
      s.contactedLeads,
      s.qualifiedLeads,
      s.quotationsCount,
      s.wonOrdersCount,
      s.lostCount,
      this.formatINR(s.totalWonRevenue),
      `${s.shareOfTotalLeadsPercentage}%`,
      `${s.leadToQuotePercentage}%`,
      `${s.quoteToOrderPercentage}%`,
      `${s.conversionRate}%`,
    ]);

    const tot = this.currentTotals();
    body.push([
      'TOTALS',
      tot.totalLeads,
      tot.contactedLeads,
      tot.qualifiedLeads,
      tot.quotationsCount,
      tot.wonOrdersCount,
      tot.lostCount,
      this.formatINR(tot.totalWonRevenue),
      '100%',
      `${tot.leadToQuotePercentage}%`,
      `${tot.quoteToOrderPercentage}%`,
      `${tot.leadToOrderPercentage}%`,
    ]);

    autoTable(doc, {
      startY: 22,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`Source_Performance_Summary_${year}.pdf`);
  }
}

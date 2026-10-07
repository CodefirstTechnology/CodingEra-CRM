import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  DashboardService,
  MonthlyPerformanceReportResponse,
  MonthlySummaryRow,
} from '../../../../core/services/dashboard.service';

@Component({
  selector: 'app-monthly-summary-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monthly-summary-card.component.html',
  styleUrl: './monthly-summary-card.component.scss',
})
export class MonthlySummaryCardComponent {
  private readonly dashboardService = inject(DashboardService);

  readonly availableYears = [2024, 2025, 2026, 2027];
  readonly selectedYear = signal<number>(new Date().getFullYear());
  readonly loading = signal<boolean>(false);
  readonly reportData = signal<MonthlyPerformanceReportResponse | null>(null);

  constructor() {
    effect(() => {
      const year = this.selectedYear();
      this.fetchMonthlySummary(year);
    });
  }

  protected fetchMonthlySummary(year: number): void {
    this.loading.set(true);
    this.dashboardService
      .getMonthlyPerformanceSummary(year, new Date().getTimezoneOffset())
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
    if (this.selectedYear() !== year) {
      this.selectedYear.set(year);
    }
  }

  protected readonly months = computed<MonthlySummaryRow[]>(() => {
    return this.reportData()?.months ?? [];
  });

  protected readonly totals = computed(() => {
    return this.reportData()?.totals ?? null;
  });

  protected formatINR(val: number | undefined | null): string {
    if (val == null || !Number.isFinite(val)) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  }

  protected formatPercent(val: number | undefined | null): string {
    if (val == null || !Number.isFinite(val)) return '0.0%';
    return `${val.toFixed(1)}%`;
  }

  protected getBadgeClass(val: number): string {
    if (val >= 60) return 'm-sum-badge--success';
    if (val >= 30) return 'm-sum-badge--warning';
    return 'm-sum-badge--neutral';
  }

  protected exportToExcel(): void {
    const rows = this.months().map((r) => ({
      Month: r.monthLabel,
      'Total Leads': r.totalLeads,
      Qualified: r.qualifiedLeads,
      Quotations: r.quotationsCount,
      'Orders Won': r.ordersWonCount,
      'Lead Value (₹)': r.leadValue,
      'Quotation Value (₹)': r.quotationValue,
      'Order Value (₹)': r.orderValue,
      'Lead -> Quote %': `${r.leadToQuotePercentage}%`,
      'Quote -> Order %': `${r.quoteToOrderPercentage}%`,
      'Lead -> Order %': `${r.leadToOrderPercentage}%`,
    }));

    const tot = this.totals();
    if (tot) {
      rows.push({
        Month: 'FULL YEAR TOTALS',
        'Total Leads': tot.totalLeads,
        Qualified: tot.qualifiedLeads,
        Quotations: tot.quotationsCount,
        'Orders Won': tot.ordersWonCount,
        'Lead Value (₹)': tot.leadValue,
        'Quotation Value (₹)': tot.quotationValue,
        'Order Value (₹)': tot.orderValue,
        'Lead -> Quote %': `${tot.leadToQuotePercentage}%`,
        'Quote -> Order %': `${tot.quoteToOrderPercentage}%`,
        'Lead -> Order %': `${tot.leadToOrderPercentage}%`,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Performance');
    XLSX.writeFile(wb, `Monthly_Performance_Summary_${this.selectedYear()}.xlsx`);
  }

  protected exportToPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const year = this.selectedYear();

    doc.setFontSize(14);
    doc.text(`CodingEra CRM - Detailed Monthly Performance Summary (${year})`, 14, 15);

    const head = [
      [
        'Month',
        'Leads',
        'Qual.',
        'Quotes',
        'Won',
        'Lead Val (₹)',
        'Quote Val (₹)',
        'Order Val (₹)',
        'L->Q %',
        'Q->O %',
        'L->O %',
      ],
    ];

    const body: (string | number)[][] = this.months().map((r) => [
      r.monthLabel,
      r.totalLeads,
      r.qualifiedLeads,
      r.quotationsCount,
      r.ordersWonCount,
      this.formatINR(r.leadValue),
      this.formatINR(r.quotationValue),
      this.formatINR(r.orderValue),
      `${r.leadToQuotePercentage}%`,
      `${r.quoteToOrderPercentage}%`,
      `${r.leadToOrderPercentage}%`,
    ]);

    const tot = this.totals();
    if (tot) {
      body.push([
        'FULL YEAR',
        tot.totalLeads,
        tot.qualifiedLeads,
        tot.quotationsCount,
        tot.ordersWonCount,
        this.formatINR(tot.leadValue),
        this.formatINR(tot.quotationValue),
        this.formatINR(tot.orderValue),
        `${tot.leadToQuotePercentage}%`,
        `${tot.quoteToOrderPercentage}%`,
        `${tot.leadToOrderPercentage}%`,
      ]);
    }

    autoTable(doc, {
      startY: 22,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`Monthly_Performance_Summary_${year}.pdf`);
  }
}

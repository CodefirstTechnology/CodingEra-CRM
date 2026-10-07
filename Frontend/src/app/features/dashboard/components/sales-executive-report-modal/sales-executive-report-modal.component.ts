import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CrmModalComponent } from '../../../../core/modal/crm-modal.component';
import { OrderValueByExecutiveChartComponent } from '../order-value-by-executive-chart/order-value-by-executive-chart.component';
import type { AdminTeamMemberStats } from '../../models/admin-dashboard.models';
import type {
  SalesExecutiveReportResponse,
  SalesExecutiveReportRow,
  SalesExecutiveReportSummary,
} from '../../../../core/services/dashboard/sales-executive-report.models';
import { SalesExecutiveReportService } from '../../../../core/services/dashboard/sales-executive-report.service';

export type RangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'custom';

@Component({
  selector: 'app-sales-executive-report-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CrmModalComponent, OrderValueByExecutiveChartComponent],
  templateUrl: './sales-executive-report-modal.component.html',
  styleUrls: ['./sales-executive-report-modal.component.scss'],
})
export class SalesExecutiveReportModalComponent {
  private readonly reportService = inject(SalesExecutiveReportService);

  readonly open = input<boolean>(false);
  readonly dismiss = output<void>();

  readonly loading = signal<boolean>(false);
  readonly selectedPreset = signal<RangePreset>('month');
  readonly startDate = signal<string>('');
  readonly endDate = signal<string>('');
  readonly searchQuery = signal<string>('');
  readonly reportData = signal<SalesExecutiveReportResponse | null>(null);

  // Checkbox Selection State
  readonly selectedUserIds = signal<Set<number>>(new Set());

  constructor() {
    this.applyPreset('month');

    effect(() => {
      if (this.open()) {
        this.fetchReport();
      }
    });
  }

  protected applyPreset(preset: RangePreset): void {
    this.selectedPreset.set(preset);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'today') {
      start = now;
      end = now;
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = y;
      end = y;
    } else if (preset === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      start = new Date(now.setDate(diff));
      end = new Date();
    } else if (preset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date();
    } else if (preset === 'quarter') {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterMonth, 1);
      end = new Date();
    }

    if (preset !== 'custom') {
      this.startDate.set(this.formatIsoDate(start));
      this.endDate.set(this.formatIsoDate(end));
    }
    if (this.open()) {
      this.fetchReport();
    }
  }

  protected fetchReport(): void {
    this.loading.set(true);
    this.reportService
      .getReport({
        startDate: this.startDate(),
        endDate: this.endDate(),
        timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
      })
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

  protected readonly filteredRows = computed<SalesExecutiveReportRow[]>(() => {
    const data = this.reportData();
    if (!data) return [];
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (r) =>
        r.executiveName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        r.roleName.toLowerCase().includes(q),
    );
  });

  protected readonly activeExportRows = computed<SalesExecutiveReportRow[]>(() => {
    const selected = this.selectedUserIds();
    const filtered = this.filteredRows();
    if (selected.size > 0) {
      return filtered.filter((r) => selected.has(r.userId));
    }
    return filtered;
  });

  protected readonly reportTeamStats = computed<AdminTeamMemberStats[]>(() => {
    const rows = this.activeExportRows();
    return rows.map((r) => ({
      userId: String(r.userId),
      name: r.executiveName,
      email: r.userEmail,
      totalLeads: r.totalLeads,
      qualifiedLeads: r.qualified,
      contactedLeads: r.contacted,
      nurtureLeads: 0,
      unqualifiedLeads: 0,
      junkLeads: 0,
      lostLeads: 0,
      convertedLeads: r.ordersWon,
      conversionRatePct: r.orderConversionPercentage,
      activeDeals: r.openLeads,
      dealsClosedWon: r.ordersWon,
      dealsClosedLost: 0,
      monthlyRevenue: r.orderValue,
      targetAmount: 0,
      targetAchieved: r.orderValue,
    }));
  });

  protected readonly dynamicSummary = computed<SalesExecutiveReportSummary>(() => {
    const rows = this.activeExportRows();

    const totalExecutives = rows.length;
    const totalLeads = rows.reduce((acc, r) => acc + (r.totalLeads || 0), 0);
    const totalContacted = rows.reduce((acc, r) => acc + (r.contacted || 0), 0);
    const totalQualified = rows.reduce((acc, r) => acc + (r.qualified || 0), 0);
    const totalMeetings = rows.reduce((acc, r) => acc + (r.meetings || 0), 0);
    const totalQuotations = rows.reduce((acc, r) => acc + (r.quotations || 0), 0);
    const totalOrdersWon = rows.reduce((acc, r) => acc + (r.ordersWon || 0), 0);
    const totalLeadValue = rows.reduce((acc, r) => acc + (r.leadValue || 0), 0);
    const totalQuotationValue = rows.reduce((acc, r) => acc + (r.quotationValue || 0), 0);
    const totalOrderValue = rows.reduce((acc, r) => acc + (r.orderValue || 0), 0);
    const totalOpenLeads = rows.reduce((acc, r) => acc + (r.openLeads || 0), 0);
    const totalOverdueFollowUps = rows.reduce((acc, r) => acc + (r.overdueFollowUps || 0), 0);

    const averageContactPercentage = this.safePercentage(totalContacted, totalLeads);
    const averageQualificationPercentage = this.safePercentage(totalQualified, totalLeads);
    const averageQuotePercentage = this.safePercentage(totalQuotations, totalLeads);
    const averageOrderConversionPercentage = this.safePercentage(totalOrdersWon, totalLeads);

    const avgCompliance =
      rows.length > 0
        ? Math.min(
            100.0,
            Math.round((rows.reduce((sum, r) => sum + (r.followUpCompliancePercentage || 0), 0) / rows.length) * 10) /
              10,
          )
        : 0.0;

    return {
      totalExecutives,
      totalLeads,
      totalContacted,
      totalQualified,
      totalMeetings,
      totalQuotations,
      totalOrdersWon,
      totalLeadValue,
      totalQuotationValue,
      totalOrderValue,
      averageContactPercentage,
      averageQualificationPercentage,
      averageQuotePercentage,
      averageOrderConversionPercentage,
      averageFollowUpCompliancePercentage: avgCompliance,
      totalOpenLeads,
      totalOverdueFollowUps,
    };
  });

  // Checkbox Selection Logic
  protected toggleUserSelection(userId: number): void {
    const current = new Set(this.selectedUserIds());
    if (current.has(userId)) {
      current.delete(userId);
    } else {
      current.add(userId);
    }
    this.selectedUserIds.set(current);
  }

  protected toggleSelectAll(): void {
    const filtered = this.filteredRows();
    if (this.isAllSelected()) {
      this.clearSelection();
    } else {
      const next = new Set<number>(filtered.map((r) => r.userId));
      this.selectedUserIds.set(next);
    }
  }

  protected isAllSelected(): boolean {
    const filtered = this.filteredRows();
    if (filtered.length === 0) return false;
    const selected = this.selectedUserIds();
    return filtered.every((r) => selected.has(r.userId));
  }

  protected isIndeterminate(): boolean {
    const filtered = this.filteredRows();
    if (filtered.length === 0) return false;
    const selected = this.selectedUserIds();
    const count = filtered.filter((r) => selected.has(r.userId)).length;
    return count > 0 && count < filtered.length;
  }

  protected clearSelection(): void {
    this.selectedUserIds.set(new Set());
  }

  protected formatINR(val: number | undefined | null): string {
    if (!val || !Number.isFinite(val)) return '₹0';
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
    if (val >= 70) return 'crm-perf-badge--success';
    if (val >= 40) return 'crm-perf-badge--warning';
    return 'crm-perf-badge--danger';
  }

  protected exportToExcel(): void {
    const list = this.activeExportRows();
    const rows = list.map((r) => ({
      'Sales Executive': r.executiveName,
      Role: r.roleName,
      Email: r.userEmail,
      'Total Leads': r.totalLeads,
      Contacted: r.contacted,
      Qualified: r.qualified,
      Meetings: r.meetings,
      Quotations: r.quotations,
      'Orders Won': r.ordersWon,
      'Lead Value': r.leadValue,
      'Quotation Value': r.quotationValue,
      'Order Value': r.orderValue,
      'Contact %': `${r.contactPercentage}%`,
      'Qualification %': `${r.qualificationPercentage}%`,
      'Quote %': `${r.quotePercentage}%`,
      'Order Conversion %': `${r.orderConversionPercentage}%`,
      'Follow-up Compliance %': `${r.followUpCompliancePercentage}%`,
      'Open Leads': r.openLeads,
      'Overdue Follow-ups': r.overdueFollowUps,
    }));

    const summary = this.dynamicSummary();
    if (list.length > 1) {
      rows.push({
        'Sales Executive': 'TOTAL / SUMMARY',
        Role: '-',
        Email: '-',
        'Total Leads': summary.totalLeads,
        Contacted: summary.totalContacted,
        Qualified: summary.totalQualified,
        Meetings: summary.totalMeetings,
        Quotations: summary.totalQuotations,
        'Orders Won': summary.totalOrdersWon,
        'Lead Value': summary.totalLeadValue,
        'Quotation Value': summary.totalQuotationValue,
        'Order Value': summary.totalOrderValue,
        'Contact %': `${summary.averageContactPercentage}%`,
        'Qualification %': `${summary.averageQualificationPercentage}%`,
        'Quote %': `${summary.averageQuotePercentage}%`,
        'Order Conversion %': `${summary.averageOrderConversionPercentage}%`,
        'Follow-up Compliance %': `${summary.averageFollowUpCompliancePercentage}%`,
        'Open Leads': summary.totalOpenLeads,
        'Overdue Follow-ups': summary.totalOverdueFollowUps,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Performance');
    XLSX.writeFile(wb, `${this.getExportFileName()}.xlsx`);
  }

  protected exportToPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`CodingEra CRM - Sales Executive Performance Report`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Period: ${this.startDate()} to ${this.endDate()}`, 14, 21);

    const head = [
      [
        'Executive',
        'Leads',
        'Cont.',
        'Qual.',
        'Mtg.',
        'Quotes',
        'Won',
        'Lead Val',
        'Quote Val',
        'Order Val',
        'Cont%',
        'Qual%',
        'Quote%',
        'Win%',
        'Comp%',
        'Open',
        'Overdue',
      ],
    ];

    const list = this.activeExportRows();
    const body: (string | number)[][] = list.map((r) => [
      r.executiveName,
      r.totalLeads,
      r.contacted,
      r.qualified,
      r.meetings,
      r.quotations,
      r.ordersWon,
      this.formatINR(r.leadValue),
      this.formatINR(r.quotationValue),
      this.formatINR(r.orderValue),
      `${r.contactPercentage}%`,
      `${r.qualificationPercentage}%`,
      `${r.quotePercentage}%`,
      `${r.orderConversionPercentage}%`,
      `${r.followUpCompliancePercentage}%`,
      r.openLeads,
      r.overdueFollowUps,
    ]);

    const summary = this.dynamicSummary();
    if (list.length > 1) {
      body.push([
        'TOTAL / SUMMARY',
        summary.totalLeads,
        summary.totalContacted,
        summary.totalQualified,
        summary.totalMeetings,
        summary.totalQuotations,
        summary.totalOrdersWon,
        this.formatINR(summary.totalLeadValue),
        this.formatINR(summary.totalQuotationValue),
        this.formatINR(summary.totalOrderValue),
        `${summary.averageContactPercentage}%`,
        `${summary.averageQualificationPercentage}%`,
        `${summary.averageQuotePercentage}%`,
        `${summary.averageOrderConversionPercentage}%`,
        `${summary.averageFollowUpCompliancePercentage}%`,
        summary.totalOpenLeads,
        summary.totalOverdueFollowUps,
      ]);
    }

    autoTable(doc, {
      startY: 25,
      head: head,
      body: body,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`${this.getExportFileName()}.pdf`);
  }

  private getExportFileName(): string {
    const list = this.activeExportRows();
    const dates = `${this.startDate()}_to_${this.endDate()}`;
    if (list.length === 1) {
      const execName = list[0].executiveName.replace(/\s+/g, '_');
      return `Performance_Report_${execName}_${dates}`;
    }
    if (this.selectedUserIds().size > 0) {
      return `Sales_Performance_Report_Selected_${list.length}_${dates}`;
    }
    return `Sales_Performance_Report_${this.selectedPreset()}_${dates}`;
  }

  private safePercentage(numerator: number, denominator: number): number {
    if (denominator <= 0) return 0.0;
    const pct = (numerator / denominator) * 100.0;
    return Math.min(100.0, Math.round(pct * 10) / 10);
  }

  private formatIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

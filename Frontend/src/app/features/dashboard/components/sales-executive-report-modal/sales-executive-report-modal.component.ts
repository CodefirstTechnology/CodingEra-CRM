import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CrmModalComponent } from '../../../../core/modal/crm-modal.component';
import {
  OrderValueByExecutiveChartComponent,
  PALETTE,
  getNiceMax,
  type ExecutiveChartData,
} from '../order-value-by-executive-chart/order-value-by-executive-chart.component';
import { formatInrCompact } from '../../../../shared/utils/format-inr.util';
import type { AdminTeamMemberStats } from '../../models/admin-dashboard.models';
import type {
  SalesExecutiveReportResponse,
  SalesExecutiveReportRow,
  SalesExecutiveReportSummary,
} from '../../../../core/services/dashboard/sales-executive-report.models';
import { SalesExecutiveReportService } from '../../../../core/services/dashboard/sales-executive-report.service';

import { AuthService } from '../../../../core/auth/auth.service';
import { ROLE_ID_ADMIN } from '../../../../core/auth/auth-role.util';

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
  private readonly auth = inject(AuthService);

  readonly open = input<boolean>(false);
  readonly filterUserId = input<number | string | null>(null);
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

    let rows = data.rows;

    // 1. Filter by filterUserId input if provided
    const targetUid = this.filterUserId();
    if (targetUid != null && targetUid !== '') {
      const uidStr = String(targetUid).trim();
      rows = rows.filter(
        (r) =>
          String(r.userId).trim() === uidStr ||
          r.userEmail?.toLowerCase() === uidStr.toLowerCase(),
      );
    } else {
      // 2. If logged in user is a Sales Executive (not Admin), restrict to logged-in user only
      const currentUser = this.auth.user();
      const isAdmin =
        currentUser?.roleId === ROLE_ID_ADMIN ||
        Boolean(currentUser?.role && /admin/i.test(currentUser.role));

      if (currentUser && !isAdmin) {
        const myUidStr = String(currentUser.id).trim();
        const myEmail = currentUser.email?.toLowerCase();
        rows = rows.filter(
          (r) =>
            String(r.userId).trim() === myUidStr ||
            (myEmail && r.userEmail?.toLowerCase() === myEmail),
        );
      }
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
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

  protected readonly chartExecutiveData = computed<ExecutiveChartData[]>(() => {
    const stats = this.reportTeamStats() ?? [];
    const list = stats
      .filter((s) => (s.monthlyRevenue || 0) > 0 || (s.dealsClosedWon || 0) > 0)
      .map((s) => ({
        userId: s.userId,
        name: s.name,
        email: s.email,
        orderValue: s.monthlyRevenue || 0,
        dealsCount: s.dealsClosedWon || 0,
      }));

    list.sort((a, b) => b.orderValue - a.orderValue || b.dealsCount - a.dealsCount);

    const totalVal = list.reduce((sum, item) => sum + item.orderValue, 0);
    const maxVal = Math.max(...list.map((item) => item.orderValue), 0);
    const niceMax = getNiceMax(maxVal);

    const topExecutives = list.slice(0, 10);
    const otherExecutives = list.slice(10);
    const listToRender = [...topExecutives];

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

    return listToRender.map((exec, idx) => {
      const pct = totalVal > 0 ? (exec.orderValue / totalVal) * 100 : 0;
      const roundedPct = Math.round(pct * 10) / 10;
      const barHeightPct = niceMax > 0 ? Math.min(100, Math.max(0, (exec.orderValue / niceMax) * 100)) : 0;
      return {
        ...exec,
        percentage: roundedPct,
        color: PALETTE[idx % PALETTE.length],
        strokeDasharray: '',
        strokeDashoffset: 0,
        formattedValue: this.formatINR(exec.orderValue),
        formattedCompact: formatInrCompact(exec.orderValue),
        barHeightPct,
      };
    });
  });

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

    // Sheet 2: Order Value by Executive (Chart Metrics & Revenue Distribution)
    const chartList = this.chartExecutiveData();
    if (chartList.length > 0) {
      const chartRows = chartList.map((c) => ({
        'Sales Executive': c.name,
        'Closed Won Deals': c.dealsCount,
        'Order Value (INR)': c.orderValue,
        'Formatted Value': c.formattedValue,
        'Revenue Share %': `${c.percentage}%`,
      }));

      const totalVal = chartList.reduce((acc, c) => acc + c.orderValue, 0);
      const totalDeals = chartList.reduce((acc, c) => acc + c.dealsCount, 0);

      chartRows.push({
        'Sales Executive': 'TOTAL CLOSED-WON REVENUE',
        'Closed Won Deals': totalDeals,
        'Order Value (INR)': totalVal,
        'Formatted Value': this.formatINR(totalVal),
        'Revenue Share %': '100.0%',
      });

      const wsChart = XLSX.utils.json_to_sheet(chartRows);
      wsChart['!cols'] = [
        { wch: 25 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
      ];
      XLSX.utils.book_append_sheet(wb, wsChart, 'Order Value by Executive');
    }

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

    // Embed visual bar chart matching UI layout
    const chartImg = this.generateChartImage();
    if (chartImg) {
      const pageHeight = doc.internal.pageSize.getHeight();
      const finalY = (doc as any).lastAutoTable?.finalY ?? 25;
      const chartW = 269; // 297mm landscape - 28mm margin
      const chartH = (chartW * 540) / 1100; // ~132mm

      if (finalY + chartH + 15 <= pageHeight) {
        doc.addImage(chartImg, 'PNG', 14, finalY + 8, chartW, chartH);
      } else {
        doc.addPage();
        doc.setFontSize(14);
        doc.text(`CodingEra CRM - Sales Executive Performance Report`, 14, 15);
        doc.setFontSize(9);
        doc.text(`Period: ${this.startDate()} to ${this.endDate()} | Visual Order Value Distribution`, 14, 21);
        doc.addImage(chartImg, 'PNG', 14, 26, chartW, chartH);
      }
    }

    doc.save(`${this.getExportFileName()}.pdf`);
  }

  private generateChartImage(): string | null {
    const data = this.chartExecutiveData();
    if (!data || data.length === 0) return null;

    const totalDeals = data.reduce((sum, d) => sum + d.dealsCount, 0);
    const maxVal = Math.max(...data.map((d) => d.orderValue), 0);
    const niceMax = getNiceMax(maxVal);

    const canvas = document.createElement('canvas');
    const width = 1100;
    const height = 540;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Card border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    this.drawRoundedRect(ctx, 10, 10, width - 20, height - 20, 12);
    ctx.stroke();

    // Card Header Title
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText('Order Value by Executive', 35, 45);

    // Subtitle
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Closed-won revenue distribution per sales executive', 35, 68);

    // Top-right Won Deals Pill Badge
    const badgeText = `${totalDeals} Won Deal${totalDeals === 1 ? '' : 's'}`;
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 24;
    const badgeX = width - 35 - badgeW;
    const badgeY = 28;
    ctx.fillStyle = '#eff6ff';
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#2563eb';
    ctx.fillText(badgeText, badgeX + 12, badgeY + 18);

    // Left Chart Plot Frame
    const boxX = 35;
    const boxY = 90;
    const boxW = 640;
    const boxH = 425;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    this.drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 8);
    ctx.stroke();

    // Title inside Plot
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText('Order Value by Executive', boxX + boxW / 2, boxY + 25);

    // Rotated Y-Axis Label
    ctx.save();
    ctx.translate(boxX + 25, boxY + boxH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('Order Value (₹)', 0, 0);
    ctx.restore();

    // Plot Canvas Area with Grid Lines
    const plotLeft = boxX + 60;
    const plotRight = boxX + boxW - 85;
    const plotTop = boxY + 50;
    const plotBottom = boxY + 340;
    const plotH = plotBottom - plotTop;
    const plotW = plotRight - plotLeft;

    const gridSteps = 8;
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    for (let i = 0; i <= gridSteps; i++) {
      const stepVal = Math.round((niceMax / gridSteps) * (gridSteps - i));
      const lineY = plotTop + (plotH / gridSteps) * i;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(plotLeft, lineY);
      ctx.lineTo(plotRight, lineY);
      ctx.stroke();

      // Right y-axis value label
      ctx.fillStyle = '#475569';
      const label = formatInrCompact(stepVal);
      ctx.fillText(label, plotRight + 8, lineY + 4);
    }

    // X-Axis Baseline
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // Column Bars
    const barCount = data.length;
    const slotW = plotW / barCount;
    const barW = Math.min(65, slotW * 0.55);

    data.forEach((item, idx) => {
      const barH = niceMax > 0 ? (item.orderValue / niceMax) * plotH : 0;
      const barX = plotLeft + slotW * idx + (slotW - barW) / 2;
      const barY = plotBottom - barH;

      ctx.fillStyle = item.color;
      ctx.fillRect(barX, barY, barW, barH);

      // Name label below baseline
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      const displayName = item.name.length > 12 ? item.name.substring(0, 10) + '...' : item.name;
      ctx.fillText(displayName, barX + barW / 2, plotBottom + 20);
    });

    // Sales Executive X-Axis Bottom Label
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Sales Executive', plotLeft + plotW / 2, boxY + boxH - 18);

    // Right Legend Area
    const legendX = 710;
    const legendYStart = 110;

    data.forEach((item, idx) => {
      const itemY = legendYStart + idx * 70;
      if (itemY > height - 60) return;

      // Color Swatch
      ctx.fillStyle = item.color;
      this.drawRoundedRect(ctx, legendX, itemY, 14, 14, 3);
      ctx.fill();

      // Executive Name
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.fillText(item.name, legendX + 24, itemY + 12);

      // Deals Count
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${item.dealsCount} deal${item.dealsCount === 1 ? '' : 's'}`, legendX + 24, itemY + 30);

      // Order Value (Right Aligned)
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'right';
      ctx.fillText(item.formattedValue, width - 45, itemY + 12);

      // Percentage (Right Aligned)
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = item.color;
      ctx.fillText(`${item.percentage}%`, width - 45, itemY + 30);
    });

    return canvas.toDataURL('image/png');
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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

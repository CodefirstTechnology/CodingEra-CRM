import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../core/toast/toast.service';
import {
  SalesRecognitionTrackerService,
  DailySalesRecognitionLogRow,
  DailySalesRecognitionUpsertDto,
  ExecutiveRankingRow,
  DailyKpiSummary,
  LeaderboardChartItem,
  calculateRowScores
} from '../services/sales-recognition-tracker.service';

type PeriodPreset = 'today' | 'week' | 'month' | 'custom';

@Component({
  selector: 'app-sales-recognition-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './sales-recognition-tracker.component.html',
  styleUrls: ['./sales-recognition-tracker.component.scss']
})
export class SalesRecognitionTrackerComponent implements OnInit {
  protected readonly Math = Math;
  private readonly trackerService = inject(SalesRecognitionTrackerService);
  private readonly toast = inject(ToastService);

  // Loading & State
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // Filters
  readonly selectedPeriod = signal<PeriodPreset>('month');
  readonly customStartDate = signal<string>('');
  readonly customEndDate = signal<string>('');
  readonly filterExecutive = signal<string>('');

  // Active Executives Dropdown List
  readonly executives = signal<string[]>([]);

  // Raw Daily Logs
  readonly rows = signal<DailySalesRecognitionLogRow[]>([]);

  // Computed & Aggregated Data
  readonly kpiSummary = signal<DailyKpiSummary>({
    totalLeads: 0,
    totalMeetings: 0,
    totalFollowUps: 0,
    totalQuotations: 0,
    totalConversions: 0,
    totalOrders: 0,
    teamAverageOverallScore: 0
  });

  readonly rankings = signal<ExecutiveRankingRow[]>([]);
  readonly chartSeries = signal<LeaderboardChartItem[]>([]);

  // Ranking sorting
  readonly rankingSortField = signal<keyof ExecutiveRankingRow>('avgOverallScore');
  readonly rankingSortAsc = signal<boolean>(false);

  // Sorted rankings computed
  readonly sortedRankings = computed(() => {
    const list = [...this.rankings()];
    const field = this.rankingSortField();
    const asc = this.rankingSortAsc();

    return list.sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      if (va == null && vb == null) return 0;
      if (va == null) return asc ? -1 : 1;
      if (vb == null) return asc ? 1 : -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return asc ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });
  });

  // Chart max value for scaling
  readonly chartMaxScore = 100;

  ngOnInit(): void {
    this.initDefaultDateRange();
    this.loadExecutives();
    this.loadData();
  }

  private initDefaultDateRange(): void {
    const today = new Date();
    // Default to 'This Month'
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.customStartDate.set(this.formatDateInput(startOfMonth));
    this.customEndDate.set(this.formatDateInput(today));
  }

  private formatDateInput(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  loadExecutives(): void {
    this.trackerService.getExecutives().subscribe({
      next: (list) => {
        this.executives.set(list || []);
      },
      error: () => {
        this.executives.set([]);
      }
    });
  }

  setPeriod(period: PeriodPreset): void {
    this.selectedPeriod.set(period);
    const today = new Date();

    if (period === 'today') {
      const str = this.formatDateInput(today);
      this.customStartDate.set(str);
      this.customEndDate.set(str);
    } else if (period === 'week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(today.setDate(diff));
      this.customStartDate.set(this.formatDateInput(monday));
      this.customEndDate.set(this.formatDateInput(new Date()));
    } else if (period === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      this.customStartDate.set(this.formatDateInput(startOfMonth));
      this.customEndDate.set(this.formatDateInput(new Date()));
    }

    this.loadData();
  }

  onCustomDateChange(): void {
    this.selectedPeriod.set('custom');
    this.loadData();
  }

  onExecutiveFilterChange(exec: string): void {
    this.filterExecutive.set(exec);
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    const s = this.customStartDate();
    const e = this.customEndDate();
    const exec = this.filterExecutive() || undefined;

    this.trackerService.getDashboardData(s, e, exec).subscribe({
      next: (res) => {
        // Enhance items with calculated fields
        const formattedItems: DailySalesRecognitionLogRow[] = res.items.map((row) => {
          const calc = calculateRowScores(row);
          return {
            ...row,
            date: row.date ? row.date.split('T')[0] : this.formatDateInput(new Date()),
            dailyActivityScore: calc.dailyActivityScore,
            businessResultScore: calc.businessResultScore,
            overallScore: calc.overallScore,
            recognition: calc.recognition,
            isModified: false,
            isNew: false
          };
        });

        this.rows.set(formattedItems);
        this.kpiSummary.set(res.kpiSummary);
        this.rankings.set(res.rankings);
        this.chartSeries.set(res.chartSeries);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load daily sales recognition data', err);
        this.error.set('Failed to load Daily Recognition Tracker data.');
        this.loading.set(false);
      }
    });
  }

  // Row Real-Time Editing & Calculation
  onRowChange(row: DailySalesRecognitionLogRow): void {
    row.isModified = true;
    const calc = calculateRowScores(row);
    row.dailyActivityScore = calc.dailyActivityScore;
    row.businessResultScore = calc.businessResultScore;
    row.overallScore = calc.overallScore;
    row.recognition = calc.recognition;

    this.recalculateLocalSummary();
  }

  onExecutiveSelect(row: DailySalesRecognitionLogRow): void {
    if (!row.executiveName || !row.executiveName.trim()) {
      row.dailyActivityScore = null;
      row.businessResultScore = null;
      row.overallScore = null;
      row.recognition = null;
      row.newLeads = 0;
      row.customerCalls = 0;
      row.meetings = 0;
      row.followUps = 0;
      row.quotations = 0;
      row.leadConversions = 0;
      row.ordersBooked = 0;
      row.paymentFollowUps = 0;
      row.reportingPercentage = 100;
      row.teamSupport = 1;
      row.leadQualityPercentage = 0;
      this.recalculateLocalSummary();
      return;
    }

    this.autofillRow(row);
  }

  onDateChange(row: DailySalesRecognitionLogRow): void {
    if (row.executiveName && row.executiveName.trim()) {
      this.autofillRow(row);
    } else {
      this.onRowChange(row);
    }
  }

  autofillRow(row: DailySalesRecognitionLogRow): void {
    if (!row.executiveName || !row.executiveName.trim() || !row.date) return;

    const execName = row.executiveName.trim();
    this.trackerService.getAutofillMetrics(row.date, execName).subscribe({
      next: (data) => {
        row.newLeads = data.newLeads;
        row.customerCalls = data.customerCalls;
        row.meetings = data.meetings;
        row.followUps = data.followUps;
        row.quotations = data.quotations;
        row.leadConversions = data.leadConversions;
        row.ordersBooked = data.ordersBooked;
        row.paymentFollowUps = data.paymentFollowUps;
        row.reportingPercentage = data.reportingPercentage;
        row.teamSupport = data.teamSupport;
        row.leadQualityPercentage = data.leadQualityPercentage;
        if (data.executiveUserId) row.executiveUserId = data.executiveUserId;

        const calc = calculateRowScores(row);
        row.dailyActivityScore = calc.dailyActivityScore;
        row.businessResultScore = calc.businessResultScore;
        row.overallScore = calc.overallScore;
        row.recognition = calc.recognition;
        row.isModified = true;

        this.recalculateLocalSummary();
        this.toast.success(`Calculated and autofilled records for ${execName}.`);
      },
      error: (err) => {
        console.error('Failed to autofill metrics for ' + execName, err);
        this.onRowChange(row);
      }
    });
  }

  autofillAllExecutivesToday(): void {
    const todayStr = this.formatDateInput(new Date());
    const targetExecs = this.executives().filter((e) => e && e.trim());

    targetExecs.forEach((exec) => {
      let existingRow = this.rows().find(
        (r) => r.executiveName === exec && r.date === todayStr
      );
      if (!existingRow) {
        existingRow = {
          id: 0,
          date: todayStr,
          executiveName: exec,
          newLeads: 0,
          customerCalls: 0,
          meetings: 0,
          followUps: 0,
          quotations: 0,
          leadConversions: 0,
          ordersBooked: 0,
          paymentFollowUps: 0,
          reportingPercentage: 100,
          teamSupport: 1,
          leadQualityPercentage: 0,
          dailyActivityScore: null,
          businessResultScore: null,
          overallScore: null,
          recognition: null,
          isNew: true,
          isModified: true
        };
        this.rows.update((list) => [existingRow!, ...list]);
      }
      this.autofillRow(existingRow);
    });
  }

  /**
   * Recalculates KPI Summary, Executive Rankings, and Chart dynamically in memory
   * so that user modifications update all sections in real-time before saving.
   */
  private recalculateLocalSummary(): void {
    const list = this.rows().filter((r) => r.executiveName && r.executiveName.trim());

    if (list.length === 0) {
      this.kpiSummary.set({
        totalLeads: 0,
        totalMeetings: 0,
        totalFollowUps: 0,
        totalQuotations: 0,
        totalConversions: 0,
        totalOrders: 0,
        teamAverageOverallScore: 0
      });
      this.rankings.set([]);
      this.chartSeries.set([]);
      return;
    }

    const totalLeads = list.reduce((acc, r) => acc + (Number(r.newLeads) || 0), 0);
    const totalMeetings = list.reduce((acc, r) => acc + (Number(r.meetings) || 0), 0);
    const totalFollowUps = list.reduce((acc, r) => acc + (Number(r.followUps) || 0), 0);
    const totalQuotations = list.reduce((acc, r) => acc + (Number(r.quotations) || 0), 0);
    const totalConversions = list.reduce((acc, r) => acc + (Number(r.leadConversions) || 0), 0);
    const totalOrders = list.reduce((acc, r) => acc + (Number(r.ordersBooked) || 0), 0);

    const validScores = list.map((r) => r.overallScore).filter((s): s is number => s != null);
    const teamAvg = validScores.length > 0
      ? Math.round((validScores.reduce((acc, s) => acc + s, 0) / validScores.length) * 10) / 10
      : 0;

    this.kpiSummary.set({
      totalLeads,
      totalMeetings,
      totalFollowUps,
      totalQuotations,
      totalConversions,
      totalOrders,
      teamAverageOverallScore: teamAvg
    });

    // Group by Executive
    const groupMap = new Map<string, DailySalesRecognitionLogRow[]>();
    for (const r of list) {
      const name = r.executiveName.trim();
      const existing = groupMap.get(name) || [];
      existing.push(r);
      groupMap.set(name, existing);
    }

    const rankList: ExecutiveRankingRow[] = [];
    const chartList: LeaderboardChartItem[] = [];

    groupMap.forEach((rows, name) => {
      const scores = rows.map((r) => r.overallScore).filter((s): s is number => s != null);
      const avgScore = scores.length > 0
        ? Math.round((scores.reduce((acc, s) => acc + s, 0) / scores.length) * 10) / 10
        : 0;

      const sumLeads = rows.reduce((acc, r) => acc + (Number(r.newLeads) || 0), 0);
      const sumMeetings = rows.reduce((acc, r) => acc + (Number(r.meetings) || 0), 0);
      const sumFollowUps = rows.reduce((acc, r) => acc + (Number(r.followUps) || 0), 0);
      const sumQuotes = rows.reduce((acc, r) => acc + (Number(r.quotations) || 0), 0);
      const sumConversions = rows.reduce((acc, r) => acc + (Number(r.leadConversions) || 0), 0);
      const sumOrders = rows.reduce((acc, r) => acc + (Number(r.ordersBooked) || 0), 0);
      const avgRep = Math.round(
        (rows.reduce((acc, r) => acc + (Number(r.reportingPercentage) || 0), 0) / rows.length) * 10
      ) / 10;

      let badge = '📝 Improve';
      if (avgScore >= 90.0) badge = '🏆 Star Performer';
      else if (avgScore >= 80.0) badge = '☀️ Excellent';
      else if (avgScore >= 70.0) badge = '👍 Good';

      rankList.push({
        executive: name,
        executiveUserId: rows[0]?.executiveUserId,
        avgOverallScore: avgScore,
        totalLeads: sumLeads,
        totalMeetings: sumMeetings,
        totalFollowUps: sumFollowUps,
        totalQuotations: sumQuotes,
        totalConversions: sumConversions,
        totalOrders: sumOrders,
        reportingPercentage: avgRep,
        recognition: badge
      });

      chartList.push({
        executive: name,
        avgOverallScore: avgScore
      });
    });

    rankList.sort((a, b) => b.avgOverallScore - a.avgOverallScore);
    chartList.sort((a, b) => b.avgOverallScore - a.avgOverallScore);

    this.rankings.set(rankList);
    this.chartSeries.set(chartList);
  }

  // Adding New Row
  addNewRow(): void {
    const todayStr = this.formatDateInput(new Date());

    const newRow: DailySalesRecognitionLogRow = {
      id: 0,
      date: todayStr,
      executiveName: '',
      newLeads: 0,
      customerCalls: 0,
      meetings: 0,
      followUps: 0,
      quotations: 0,
      leadConversions: 0,
      ordersBooked: 0,
      paymentFollowUps: 0,
      reportingPercentage: 100,
      teamSupport: 1,
      leadQualityPercentage: 0,
      dailyActivityScore: null,
      businessResultScore: null,
      overallScore: null,
      recognition: null,
      isNew: true,
      isModified: true
    };

    this.rows.update((list) => [newRow, ...list]);
    this.recalculateLocalSummary();
  }

  // Save Single Row
  saveRow(row: DailySalesRecognitionLogRow): void {
    if (!row.executiveName || !row.executiveName.trim()) {
      this.toast.error('Please select an Executive before saving.');
      return;
    }

    this.saving.set(true);

    const dto: DailySalesRecognitionUpsertDto = {
      id: row.id > 0 ? row.id : undefined,
      date: row.date,
      executiveUserId: row.executiveUserId,
      executiveName: row.executiveName.trim(),
      newLeads: Number(row.newLeads) || 0,
      customerCalls: Number(row.customerCalls) || 0,
      meetings: Number(row.meetings) || 0,
      followUps: Number(row.followUps) || 0,
      quotations: Number(row.quotations) || 0,
      leadConversions: Number(row.leadConversions) || 0,
      ordersBooked: Number(row.ordersBooked) || 0,
      paymentFollowUps: Number(row.paymentFollowUps) || 0,
      reportingPercentage: Number(row.reportingPercentage) ?? 100,
      teamSupport: Number(row.teamSupport) || 1,
      leadQualityPercentage: Number(row.leadQualityPercentage) || 0
    };

    this.trackerService.saveLog(dto).subscribe({
      next: (saved) => {
        this.saving.set(false);
        row.id = saved.id;
        row.isModified = false;
        row.isNew = false;
        this.toast.success(`Log for ${row.executiveName} saved successfully.`);
        this.loadData();
      },
      error: (err) => {
        console.error('Failed to save row', err);
        this.saving.set(false);
        this.toast.error('Failed to save log.');
      }
    });
  }

  // Save All Modified Rows
  saveAllModified(): void {
    const modifiedRows = this.rows().filter(
      (r) => (r.isModified || r.isNew) && r.executiveName && r.executiveName.trim()
    );

    if (modifiedRows.length === 0) {
      this.toast.info('No pending changes to save.');
      return;
    }

    this.saving.set(true);

    const dtos: DailySalesRecognitionUpsertDto[] = modifiedRows.map((row) => ({
      id: row.id > 0 ? row.id : undefined,
      date: row.date,
      executiveUserId: row.executiveUserId,
      executiveName: row.executiveName.trim(),
      newLeads: Number(row.newLeads) || 0,
      customerCalls: Number(row.customerCalls) || 0,
      meetings: Number(row.meetings) || 0,
      followUps: Number(row.followUps) || 0,
      quotations: Number(row.quotations) || 0,
      leadConversions: Number(row.leadConversions) || 0,
      ordersBooked: Number(row.ordersBooked) || 0,
      paymentFollowUps: Number(row.paymentFollowUps) || 0,
      reportingPercentage: Number(row.reportingPercentage) ?? 100,
      teamSupport: Number(row.teamSupport) || 1,
      leadQualityPercentage: Number(row.leadQualityPercentage) || 0
    }));

    this.trackerService.bulkSaveLogs(dtos).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(`Successfully saved ${dtos.length} daily log(s).`);
        this.loadData();
      },
      error: (err) => {
        console.error('Failed to bulk save logs', err);
        this.saving.set(false);
        this.toast.error('Failed to save daily logs.');
      }
    });
  }

  // Delete Row
  deleteRow(row: DailySalesRecognitionLogRow, index: number): void {
    if (row.id <= 0 || row.isNew) {
      this.rows.update((list) => list.filter((_, i) => i !== index));
      this.recalculateLocalSummary();
      return;
    }

    if (!confirm(`Are you sure you want to delete log for ${row.executiveName} on ${row.date}?`)) {
      return;
    }

    this.trackerService.deleteLog(row.id).subscribe({
      next: () => {
        this.rows.update((list) => list.filter((r) => r.id !== row.id));
        this.toast.success('Log deleted.');
        this.recalculateLocalSummary();
      },
      error: (err) => {
        console.error('Failed to delete log', err);
        this.toast.error('Failed to delete log.');
      }
    });
  }

  // Sorting rankings table
  onSortRanking(field: keyof ExecutiveRankingRow): void {
    if (this.rankingSortField() === field) {
      this.rankingSortAsc.update((asc) => !asc);
    } else {
      this.rankingSortField.set(field);
      this.rankingSortAsc.set(false); // default descending for metrics
    }
  }

  // Visual Badge Classes
  getBadgeClass(recognition: string | null | undefined): string {
    if (!recognition) return 'badge--empty';
    if (recognition.includes('Star')) return 'badge--star';
    if (recognition.includes('Excellent')) return 'badge--excellent';
    if (recognition.includes('Good')) return 'badge--good';
    return 'badge--improve';
  }
}

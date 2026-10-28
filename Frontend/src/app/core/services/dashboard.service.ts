import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MonthlySummaryRow {
  monthLabel: string;
  monthNumber: number;
  totalLeads: number;
  qualifiedLeads: number;
  quotationsCount: number;
  ordersWonCount: number;
  leadValue: number;
  quotationValue: number;
  orderValue: number;
  leadToQuotePercentage: number;
  quoteToOrderPercentage: number;
  leadToOrderPercentage: number;
}

export interface MonthlySummaryTotals {
  totalLeads: number;
  qualifiedLeads: number;
  quotationsCount: number;
  ordersWonCount: number;
  leadValue: number;
  quotationValue: number;
  orderValue: number;
  leadToQuotePercentage: number;
  quoteToOrderPercentage: number;
  leadToOrderPercentage: number;
}

export interface MonthlyPerformanceReportResponse {
  selectedYear: number;
  months: MonthlySummaryRow[];
  totals: MonthlySummaryTotals;
}

export interface SourceMonthlyTrend {
  monthLabel: string;
  monthNumber: number;
  year: number;
  totalLeads: number;
  qualifiedLeads: number;
  quotationsCount: number;
  wonOrdersCount: number;
  leadValue: number;
  quotationValue: number;
  wonRevenue: number;
  sourceLeadCounts: Record<string, number>;
  sourceWonRevenues: Record<string, number>;
}

export interface SourceSummaryItem {
  sourceName: string;
  totalLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  quotationsCount: number;
  wonOrdersCount: number;
  lostCount: number;
  openCount: number;
  totalLeadValue: number;
  totalQuotedValue: number;
  totalWonRevenue: number;
  contactPercentage: number;
  qualificationPercentage: number;
  leadToQuotePercentage: number;
  quoteToOrderPercentage: number;
  conversionRate: number;
  shareOfTotalLeadsPercentage: number;
}

export interface SourceSummaryTotals {
  totalLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  quotationsCount: number;
  wonOrdersCount: number;
  lostCount: number;
  openCount: number;
  totalLeadValue: number;
  totalQuotedValue: number;
  totalWonRevenue: number;
  averageContactPercentage: number;
  averageQualificationPercentage: number;
  averageLeadToQuotePercentage: number;
  averageQuoteToOrderPercentage: number;
  overallConversionRate: number;
}

export interface SourceSummaryResponse {
  selectedYear: number;
  selectedSource?: string;
  fromDate?: string;
  toDate?: string;
  configuredSources: string[];
  sources: SourceSummaryItem[];
  monthlyTrends: SourceMonthlyTrend[];
  totals: SourceSummaryTotals;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl ? environment.apiUrl.replace(/\/+$/, '') : '';

  getMonthlyPerformanceSummary(
    year: number,
    timeZoneOffsetMinutes: number = new Date().getTimezoneOffset(),
  ): Observable<MonthlyPerformanceReportResponse> {
    const params = new HttpParams()
      .set('year', year.toString())
      .set('timeZoneOffsetMinutes', timeZoneOffsetMinutes.toString());

    return this.http.get<MonthlyPerformanceReportResponse>(
      `${this.baseUrl}/dashboard/monthly-performance-summary`,
      { params },
    );
  }

  getSourcePerformanceSummary(
    year: number,
    source?: string,
    fromDate?: string,
    toDate?: string,
    timeZoneOffsetMinutes: number = new Date().getTimezoneOffset(),
  ): Observable<SourceSummaryResponse> {
    let params = new HttpParams()
      .set('year', year.toString())
      .set('timeZoneOffsetMinutes', timeZoneOffsetMinutes.toString());

    if (source && source !== 'All') {
      params = params.set('source', source);
    }
    if (fromDate) {
      params = params.set('fromDate', fromDate);
    }
    if (toDate) {
      params = params.set('toDate', toDate);
    }

    return this.http.get<SourceSummaryResponse>(
      `${this.baseUrl}/dashboard/source-performance-summary`,
      { params },
    );
  }
}

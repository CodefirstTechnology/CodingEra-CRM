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
}

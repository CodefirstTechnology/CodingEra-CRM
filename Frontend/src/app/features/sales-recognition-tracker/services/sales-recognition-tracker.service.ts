import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface DailySalesRecognitionLogRow {
  id: number;
  date: string;
  executiveUserId?: number | null;
  executiveName: string;
  newLeads: number;
  customerCalls: number;
  meetings: number;
  followUps: number;
  quotations: number;
  leadConversions: number;
  ordersBooked: number;
  paymentFollowUps: number;
  reportingPercentage: number;
  teamSupport: number;
  leadQualityPercentage: number;
  dailyActivityScore: number | null;
  businessResultScore: number | null;
  overallScore: number | null;
  recognition: string | null;
  createdAt?: string;
  updatedAt?: string;
  isNew?: boolean;
  isModified?: boolean;
}

export interface DailySalesRecognitionUpsertDto {
  id?: number;
  date: string;
  executiveUserId?: number | null;
  executiveName: string;
  newLeads: number;
  customerCalls: number;
  meetings: number;
  followUps: number;
  quotations: number;
  leadConversions: number;
  ordersBooked: number;
  paymentFollowUps: number;
  reportingPercentage: number;
  teamSupport: number;
  leadQualityPercentage: number;
}

export interface ExecutiveRankingRow {
  executive: string;
  executiveUserId?: number | null;
  avgOverallScore: number;
  totalLeads: number;
  totalMeetings: number;
  totalFollowUps: number;
  totalQuotations: number;
  totalConversions: number;
  totalOrders: number;
  reportingPercentage: number;
  recognition: string;
}

export interface DailyKpiSummary {
  totalLeads: number;
  totalMeetings: number;
  totalFollowUps: number;
  totalQuotations: number;
  totalConversions: number;
  totalOrders: number;
  teamAverageOverallScore: number;
}

export interface LeaderboardChartItem {
  executive: string;
  avgOverallScore: number;
}

export interface DailySalesRecognitionDashboardResponse {
  items: DailySalesRecognitionLogRow[];
  kpiSummary: DailyKpiSummary;
  rankings: ExecutiveRankingRow[];
  chartSeries: LeaderboardChartItem[];
}

/**
 * Real-time row calculation following exact Excel benchmarks and formulas.
 * Row Guard Rule: If Executive is not selected or row is blank, keep calculation cells completely empty.
 */
export function calculateRowScores(row: Partial<DailySalesRecognitionLogRow>): {
  dailyActivityScore: number | null;
  businessResultScore: number | null;
  overallScore: number | null;
  recognition: string | null;
} {
  if (!row.executiveName || !row.executiveName.trim()) {
    return {
      dailyActivityScore: null,
      businessResultScore: null,
      overallScore: null,
      recognition: null,
    };
  }

  const newLeads = Math.max(0, Number(row.newLeads) || 0);
  const customerCalls = Math.max(0, Number(row.customerCalls) || 0);
  const meetings = Math.max(0, Number(row.meetings) || 0);
  const followUps = Math.max(0, Number(row.followUps) || 0);
  const quotations = Math.max(0, Number(row.quotations) || 0);
  const leadConversions = Math.max(0, Number(row.leadConversions) || 0);
  const ordersBooked = Math.max(0, Number(row.ordersBooked) || 0);
  const paymentFollowUps = Math.max(0, Number(row.paymentFollowUps) || 0);
  const reportingPct = Number(row.reportingPercentage) ?? 100;
  const teamSupport = Math.max(0, Number(row.teamSupport) || 0);
  const leadQualityPct = Math.max(0, Math.min(100, Number(row.leadQualityPercentage) || 0));

  // Daily Activity Score (0–100 Scale)
  const act = Math.min(
    100,
    (Math.min(newLeads / 5, 1) * 15) +
    (Math.min(customerCalls / 20, 1) * 10) +
    (Math.min(meetings / 3, 1) * 15) +
    (Math.min(followUps / 10, 1) * 15) +
    (Math.min(quotations / 5, 1) * 10) +
    (Math.min(leadConversions / 2, 1) * 10) +
    (Math.min(paymentFollowUps / 5, 1) * 5) +
    ((reportingPct / 100) * 5) +
    (Math.min(teamSupport / 1, 1) * 5)
  );

  // Business Result Score (0–100 Scale)
  const res = Math.min(
    100,
    (Math.min(leadConversions / 2, 1) * 35) +
    (Math.min(ordersBooked / 1, 1) * 45) +
    ((leadQualityPct / 100) * 20)
  );

  // Overall Score (70% Activity / 30% Results)
  const overall = Math.round(((0.70 * act) + (0.30 * res)) * 10) / 10;

  // Recognition Badge Tier
  let badge = '📝 Improve';
  if (overall >= 90.0) badge = '🏆 Star Performer';
  else if (overall >= 80.0) badge = '☀️ Excellent';
  else if (overall >= 70.0) badge = '👍 Good';

  return {
    dailyActivityScore: Math.round(act * 10) / 10,
    businessResultScore: Math.round(res * 10) / 10,
    overallScore: overall,
    recognition: badge,
  };
}

@Injectable({ providedIn: 'root' })
export class SalesRecognitionTrackerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/daily-sales-recognition`;

  getDashboardData(
    startDate?: string,
    endDate?: string,
    executive?: string
  ): Observable<DailySalesRecognitionDashboardResponse> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    if (executive) params = params.set('executive', executive);

    return this.http.get<DailySalesRecognitionDashboardResponse>(this.baseUrl, { params });
  }

  saveLog(dto: DailySalesRecognitionUpsertDto): Observable<DailySalesRecognitionLogRow> {
    if (dto.id && dto.id > 0) {
      return this.http.put<DailySalesRecognitionLogRow>(`${this.baseUrl}/${dto.id}`, dto);
    }
    return this.http.post<DailySalesRecognitionLogRow>(this.baseUrl, dto);
  }

  bulkSaveLogs(dtos: DailySalesRecognitionUpsertDto[]): Observable<DailySalesRecognitionLogRow[]> {
    return this.http.post<DailySalesRecognitionLogRow[]>(`${this.baseUrl}/bulk`, dtos);
  }

  deleteLog(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`);
  }

  getExecutives(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/executives`);
  }

  getAutofillMetrics(date: string, executive: string): Observable<DailySalesRecognitionLogRow> {
    const params = new HttpParams()
      .set('date', date)
      .set('executive', executive);
    return this.http.get<DailySalesRecognitionLogRow>(`${this.baseUrl}/autofill-metrics`, { params });
  }
}

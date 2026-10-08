import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface LeadTrackerRow {
  leadIdNum: number;
  leadId: string;
  leadDate: string | null;
  monthFormatted: string;
  salesExecutive: string;
  leadSource: string;
  customerName: string;
  contactPerson: string;
  mobile: string;
  requirementProduct: string;
  estimatedLeadValue: number;
  firstContactDate: string | null;
  contacted: string;
  qualified: string;
  meetingDate: string | null;
  meetingDone: string;
  quotationDate: string | null;
  quotationValue: number;
  lastFollowUpDate: string | null;
  nextFollowUpDate: string | null;
  followUpStatus: string;
  currentStage: string;
  status: string;
  daysOpen: number;
  ageingBucket: string;
  expectedOrderDate: string | null;
  orderDate: string | null;
  orderValue: number;
  lostReason: string;
}

export interface LeadTrackerSummaryDto {
  totalLeads: number;
  openLeads: number;
  wonLeads: number;
  lostLeads: number;
  totalEstimatedValue: number;
  totalQuotationValue: number;
  totalWonValue: number;
}

export interface LeadTrackerPagedResultDto {
  items: LeadTrackerRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
  summary: LeadTrackerSummaryDto;
}

export interface LeadTrackerQueryParams {
  pageIndex?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  salesExecutive?: string;
  stage?: string;
  status?: string;
  ageingBucket?: string;
  followUpStatus?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LeadTrackerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/admin/lead-tracker`;

  /**
   * Fetch paginated & filtered lead tracker metrics + summary.
   */
  getTrackerData(params: LeadTrackerQueryParams): Observable<LeadTrackerPagedResultDto> {
    const httpParams = this.buildHttpParams(params);
    return this.http.get<LeadTrackerPagedResultDto>(this.baseUrl, { params: httpParams });
  }

  /**
   * Stream ClosedXML Excel binary file for download.
   */
  downloadExcel(params: LeadTrackerQueryParams): Observable<Blob> {
    const httpParams = this.buildHttpParams(params);
    return this.http.get(`${this.baseUrl}/export/excel`, {
      params: httpParams,
      responseType: 'blob'
    });
  }

  private buildHttpParams(params: LeadTrackerQueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (params.pageIndex !== undefined) httpParams = httpParams.set('pageIndex', params.pageIndex.toString());
    if (params.pageSize !== undefined) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    if (params.sortBy) httpParams = httpParams.set('sortBy', params.sortBy);
    if (params.sortDirection) httpParams = httpParams.set('sortDirection', params.sortDirection);
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.salesExecutive) httpParams = httpParams.set('salesExecutive', params.salesExecutive);
    if (params.stage) httpParams = httpParams.set('stage', params.stage);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.ageingBucket) httpParams = httpParams.set('ageingBucket', params.ageingBucket);
    if (params.followUpStatus) httpParams = httpParams.set('followUpStatus', params.followUpStatus);
    if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
    if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
    return httpParams;
  }
}

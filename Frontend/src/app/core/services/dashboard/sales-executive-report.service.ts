import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import type { SalesExecutiveReportQuery, SalesExecutiveReportResponse } from './sales-executive-report.models';

@Injectable({ providedIn: 'root' })
export class SalesExecutiveReportService {
  private readonly http = inject(HttpClient);

  getReport(query: SalesExecutiveReportQuery = {}): Observable<SalesExecutiveReportResponse | null> {
    let params = new HttpParams();
    if (query.startDate) params = params.set('startDate', query.startDate);
    if (query.endDate) params = params.set('endDate', query.endDate);
    const offset = query.timeZoneOffsetMinutes ?? new Date().getTimezoneOffset();
    params = params.set('timeZoneOffsetMinutes', String(offset));
    if (query.roleId) params = params.set('roleId', String(query.roleId));
    if (query.includeInactiveUsers) params = params.set('includeInactiveUsers', 'true');

    const base = (environment.apiUrl || '').replace(/\/$/, '');
    return this.http
      .get<SalesExecutiveReportResponse>(`${base}/dashboard/sales-executive-performance-report`, { params })
      .pipe(
        catchError((err) => {
          console.error('[SalesExecutiveReportService] Report fetch failed:', err);
          return of(null);
        }),
      );
  }
}

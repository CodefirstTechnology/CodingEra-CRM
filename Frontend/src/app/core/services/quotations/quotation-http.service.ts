import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type {
  QuotationGridColumnsDto,
  QuotationListItem,
  QuotationNextNumber,
  QuotationSettings,
  QuotationStatus,
  QuotationUpsertDto,
} from './quotation-api.models';
import {
  extractQuotationList,
  mapGridColumns,
  mapNextNumber,
  mapQuotationDetail,
  mapQuotationListItem,
  mapSettings,
  toApiUpsertBody,
} from './quotation-api.mapper';
import {
  defaultQuotationNextNumber,
  defaultQuotationSettings,
} from './quotation-next-number.util';

export interface QuotationListQuery {
  status?: string;
  dealId?: number;
}

@Injectable({ providedIn: 'root' })
export class QuotationHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/quotations`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(query?: QuotationListQuery): Observable<QuotationListItem[]> {
    let params = new HttpParams();
    if (query?.status?.trim()) params = params.set('status', query.status.trim());
    if (query?.dealId != null && query.dealId > 0) {
      params = params.set('dealId', String(query.dealId));
    }
    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params })
      .pipe(map((raw) => extractQuotationList(raw).map((item) => mapQuotationListItem(item))));
  }

  getStatuses(): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.baseUrl}/statuses`, { headers: this.jsonHeaders() })
      .pipe(catchError(() => of(['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'])));
  }

  getSettings(): Observable<QuotationSettings> {
    return this.http
      .get<unknown>(`${this.baseUrl}/settings`, { headers: this.jsonHeaders() })
      .pipe(
        map((raw) => mapSettings(raw)),
        catchError(() => of(defaultQuotationSettings())),
      );
  }

  updateSettings(settings: QuotationSettings): Observable<QuotationSettings> {
    return this.http
      .put<unknown>(`${this.baseUrl}/settings`, settings, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapSettings(raw)));
  }

  getNextNumber(companyCode?: string): Observable<QuotationNextNumber> {
    let params = new HttpParams();
    if (companyCode?.trim()) params = params.set('companyCode', companyCode.trim());
    const fallbackCc = companyCode?.trim() || defaultQuotationSettings().companyCode;
    return this.http
      .get<unknown>(`${this.baseUrl}/next-number`, { headers: this.jsonHeaders(), params })
      .pipe(
        map((raw) => mapNextNumber(raw)),
        catchError(() => of(defaultQuotationNextNumber(fallbackCc))),
      );
  }

  getById(id: number): Observable<QuotationUpsertDto | null> {
    return this.http.get<unknown>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() }).pipe(
      map((raw) => (raw != null ? mapQuotationDetail(raw) : null)),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of(null) : throwError(() => err),
      ),
    );
  }

  create(body: QuotationUpsertDto): Observable<QuotationUpsertDto> {
    return this.http
      .post<unknown>(this.baseUrl, toApiUpsertBody(body), { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapQuotationDetail(raw)));
  }

  update(id: number, body: QuotationUpsertDto): Observable<QuotationUpsertDto> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, toApiUpsertBody({ ...body, id }), {
        headers: this.jsonHeaders(),
      })
      .pipe(map((raw) => mapQuotationDetail(raw)));
  }

  patchStatus(id: number, status: QuotationStatus | string): Observable<QuotationUpsertDto> {
    return this.http
      .patch<unknown>(
        `${this.baseUrl}/${id}/status`,
        { status },
        { headers: this.jsonHeaders() },
      )
      .pipe(map((raw) => mapQuotationDetail(raw)));
  }

  duplicate(id: number): Observable<QuotationUpsertDto> {
    return this.http
      .post<unknown>(`${this.baseUrl}/${id}/duplicate`, {}, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapQuotationDetail(raw)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }

  getItemGridColumns(): Observable<QuotationGridColumnsDto> {
    return this.http
      .get<unknown>(`${this.baseUrl}/item-grid/columns`, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapGridColumns(raw)));
  }

  saveItemGridColumns(columns: QuotationGridColumnsDto): Observable<QuotationGridColumnsDto> {
    return this.http
      .put<unknown>(`${this.baseUrl}/item-grid/columns`, columns, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapGridColumns(raw)));
  }

  getItemGridDefaults(): Observable<QuotationGridColumnsDto> {
    return this.http
      .get<unknown>(`${this.baseUrl}/item-grid/defaults`, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapGridColumns(raw)));
  }

  saveItemGridDefaults(columns: QuotationGridColumnsDto): Observable<QuotationGridColumnsDto> {
    return this.http
      .put<unknown>(`${this.baseUrl}/item-grid/defaults`, columns, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapGridColumns(raw)));
  }
}

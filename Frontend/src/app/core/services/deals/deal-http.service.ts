import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { normalizeDealApiRecord } from './deal-api.mapper';
import type { DealNormalized, DealUpsertDto } from './deal-api.models';

function extractDealRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = ['data', 'items', 'value', 'result', 'deals', 'Deals', 'Data', 'Items', '$values'];
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return [];
}

@Injectable({ providedIn: 'root' })
export class DealHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/deals`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`);
    }
    return h;
  }

  list(): Observable<DealNormalized[]> {
    return this.http.get<unknown>(this.baseUrl, { headers: this.jsonHeaders() }).pipe(
      map((raw) => extractDealRecords(raw).map((item) => normalizeDealApiRecord(item))),
    );
  }

  getById(id: number): Observable<DealNormalized | null> {
    return this.http.get<unknown>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() }).pipe(
      map((raw) => (raw != null ? normalizeDealApiRecord(raw) : null)),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of(null) : throwError(() => err),
      ),
    );
  }

  create(body: DealUpsertDto): Observable<DealNormalized> {
    return this.http
      .post<unknown>(this.baseUrl, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeDealApiRecord(raw)));
  }

  put(id: number, body: DealUpsertDto): Observable<DealNormalized> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeDealApiRecord(raw)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }
}

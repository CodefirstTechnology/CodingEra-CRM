import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { DealApiDto } from './deal-api.models';

/** Accepts a bare array or common ASP.NET / OData wrappers. */
function extractDealDtos(raw: unknown): DealApiDto[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is DealApiDto => x != null && typeof x === 'object');
  }
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = ['data', 'items', 'value', 'result', 'deals', 'Deals', 'Data', 'Items', '$values'];
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) {
        return v.filter((x): x is DealApiDto => x != null && typeof x === 'object');
      }
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        const rows = v.filter((x): x is DealApiDto => x != null && typeof x === 'object');
        if (rows.length > 0) return rows;
      }
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

  list(): Observable<DealApiDto[]> {
    return this.http.get<unknown>(this.baseUrl, { headers: this.jsonHeaders() }).pipe(
      map((raw) => extractDealDtos(raw)),
    );
  }

  getById(id: number): Observable<DealApiDto | null> {
    return this.http.get<DealApiDto>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() }).pipe(
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of(null) : throwError(() => err),
      ),
    );
  }

  create(body: DealApiDto): Observable<DealApiDto> {
    return this.http.post<DealApiDto>(this.baseUrl, body, { headers: this.jsonHeaders() });
  }

  put(id: number, body: DealApiDto): Observable<DealApiDto> {
    return this.http.put<DealApiDto>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }
}

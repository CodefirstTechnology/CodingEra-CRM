import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { OrganizationRow } from '../../../features/organizations/organizations.component';
import {
  normalizeOrganizationApiRecord,
  organizationCreatePayload,
  readOrganizationIdFromApiRaw,
  type OrganizationCreateInput,
} from './organization-api.mapper';

function extractOrganizationRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = [
      'data',
      'items',
      'value',
      'result',
      'organizations',
      'Organizations',
      'Data',
      'Items',
      '$values',
    ];
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
export class OrganizationHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/organizations`;

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

  list(): Observable<OrganizationRow[]> {
    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders() })
      .pipe(map((raw) => extractOrganizationRecords(raw).map((item) => normalizeOrganizationApiRecord(item))));
  }

  search(term: string, limit = 20): Observable<OrganizationRow[]> {
    const q = term.trim();
    if (q.length < 2) {
      return of([]);
    }
    const params = new HttpParams().set('search', q).set('limit', String(limit));
    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params })
      .pipe(map((raw) => extractOrganizationRecords(raw).map((item) => normalizeOrganizationApiRecord(item))));
  }

  getById(id: number): Observable<OrganizationRow | null> {
    return this.http.get<unknown>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() }).pipe(
      map((raw) => (raw != null && typeof raw === 'object' ? normalizeOrganizationApiRecord(raw) : null)),
      catchError(() => of(null)),
    );
  }

  create(input: OrganizationCreateInput): Observable<OrganizationRow> {
    const payload = organizationCreatePayload(input);
    return this.http.post<unknown>(this.baseUrl, payload, { headers: this.jsonHeaders() }).pipe(
      map((raw) => {
        const row = normalizeOrganizationApiRecord(raw);
        const id = readOrganizationIdFromApiRaw(raw);
        if (id != null && (!row.id || !String(row.id).trim())) {
          return { ...row, id: String(id) };
        }
        return row;
      }),
    );
  }

  /** `PUT /api/organizations/{id}` — partial upsert fields merged with `id` in body. */
  put(id: number, body: Record<string, unknown>): Observable<OrganizationRow> {
    const payload = { ...body, id };
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, payload, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeOrganizationApiRecord(raw)));
  }
}

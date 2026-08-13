import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { ContactRow } from '../../../features/contacts/contacts.component';
import {
  contactRowToUpsertDto,
  extractContactRecords,
  mapContactApiRecord,
  type ContactUpsertDto,
} from './contact-api.mapper';
import type { ContactImportCommitResult, ContactImportRowDto } from '../../../features/contacts/import/contact-import-api.models';


export interface ContactListQuery {
  userId?: number;
  organizationId?: number;
  search?: string;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class ContactHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/contacts`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(query?: ContactListQuery): Observable<ContactRow[]> {
    let params = new HttpParams();
    if (query?.userId != null && query.userId > 0) {
      params = params.set('userId', String(query.userId));
    }
    if (query?.organizationId != null && query.organizationId > 0) {
      params = params.set('organizationId', String(query.organizationId));
    }
    if (query?.search?.trim()) {
      params = params.set('search', query.search.trim());
    }
    if (query?.limit != null && query.limit > 0) {
      params = params.set('limit', String(query.limit));
    }

    return this.http.get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params }).pipe(
      map((raw) => extractContactRecords(raw).map((item) => mapContactApiRecord(item))),
    );
  }

  search(term: string, organizationId?: number, limit = 20): Observable<ContactRow[]> {
    const q = term.trim();
    if (q.length < 2) {
      return of([]);
    }
    return this.list({ search: q, organizationId, limit });
  }

  getById(id: number): Observable<ContactRow | null> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() })
      .pipe(
        map((raw) => (raw != null ? mapContactApiRecord(raw) : null)),
        catchError(() => of(null)),
      );
  }

  create(body: ContactUpsertDto): Observable<ContactRow> {
    return this.http
      .post<unknown>(this.baseUrl, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapContactApiRecord(raw)));
  }

  update(id: number, body: ContactUpsertDto): Observable<ContactRow | null> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => (raw != null ? mapContactApiRecord(raw) : null)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }

  commitImport(rows: ContactImportRowDto[]): Observable<ContactImportCommitResult> {
    return this.http
      .post<unknown>(`${this.baseUrl}/import/commit`, { rows }, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeContactImportCommitResult(raw)));
  }
}

function readInt(raw: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
    if (typeof val === 'string' && val.trim()) {
      const n = Number(val);
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  return 0;
}

function normalizeContactImportCommitResult(raw: unknown): ContactImportCommitResult {
  const o =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const errorsRaw = o['validationErrors'] ?? o['ValidationErrors'];
  const validationErrors = Array.isArray(errorsRaw)
    ? errorsRaw.map((item) => {
        const e = item != null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const errList = e['errors'] ?? e['Errors'];
        return {
          rowNumber: readInt(e, ['rowNumber', 'RowNumber']),
          isDuplicate: Boolean(e['isDuplicate'] ?? e['IsDuplicate']),
          errors: Array.isArray(errList)
            ? errList.filter((v): v is string => typeof v === 'string')
            : [],
        };
      })
    : undefined;

  return {
    importedCount: readInt(o, ['importedCount', 'ImportedCount']),
    duplicateCount: readInt(o, ['duplicateCount', 'DuplicateCount']),
    invalidCount: readInt(o, ['invalidCount', 'InvalidCount']),
    validationErrors,
  };
}

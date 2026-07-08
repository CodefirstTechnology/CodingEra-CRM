import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { normalizeLeadApiRecord } from './lead-api.mapper';
import type { LeadNormalized, LeadUpsertDto } from './lead-api.models';
import { stripLeadUpsertForPost } from './lead-upsert-body.util';
import type { LeadImportCommitResult, LeadImportRowDto } from '../../../features/leads/import/lead-import-api.models';

export interface LeadListQuery {
  leadSource?: string;
  status?: string;
  /** `users.id` / `users.role_id` owner FK on leads. */
  leadOwnerId?: number;
  assignedToUserId?: number;
  userId?: number;
}

function extractLeadRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = ['data', 'items', 'value', 'result', 'leads', 'Leads', 'Data', 'Items', '$values'];
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

function normalizeLeadImportCommitResult(raw: unknown): LeadImportCommitResult {
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

@Injectable({ providedIn: 'root' })
export class LeadHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/leads`;

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

  list(query?: LeadListQuery): Observable<LeadNormalized[]> {
    let params = new HttpParams();
    if (query?.leadSource?.trim()) {
      params = params.set('leadSource', query.leadSource.trim());
    }
    if (query?.status?.trim()) {
      params = params.set('status', query.status.trim());
    }
    const ownerId = query?.leadOwnerId ?? query?.assignedToUserId;
    if (ownerId != null && ownerId > 0) {
      const id = String(ownerId);
      params = params
        .set('leadOwnerId', id)
        .set('lead_owner_id', id);
    }
    return this.http
      .get<unknown>(this.baseUrl, {
        headers: this.jsonHeaders(),
        params,
      })
      .pipe(map((raw) => extractLeadRecords(raw).map((item) => normalizeLeadApiRecord(item))));
  }

  getById(id: number): Observable<LeadNormalized | null> {
    return this.http.get<unknown>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() }).pipe(
      map((raw) => (raw != null ? normalizeLeadApiRecord(raw) : null)),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of(null) : throwError(() => err),
      ),
    );
  }

  create(body: LeadUpsertDto): Observable<LeadNormalized> {
    const payload = stripLeadUpsertForPost(body);
    return this.http
      .post<unknown>(this.baseUrl, payload, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeLeadApiRecord(raw)));
  }

  put(id: number, body: LeadUpsertDto | Record<string, unknown>): Observable<LeadNormalized> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeLeadApiRecord(raw)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }

  commitImport(rows: LeadImportRowDto[]): Observable<LeadImportCommitResult> {
    return this.http
      .post<unknown>(`${this.baseUrl}/import/commit`, { rows }, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeLeadImportCommitResult(raw)));
  }
}

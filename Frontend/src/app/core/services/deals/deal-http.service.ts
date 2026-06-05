import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { normalizeDealApiRecord } from './deal-api.mapper';
import type { DealNormalized, DealUpsertDto } from './deal-api.models';
import { buildDealPutJson, stripDealUpsertForPost } from './deal-upsert-body.util';

/** Matches OpenAPI `GET /api/deals` (`userId`, `status`). */
export interface DealListQuery {
  userId?: number;
  status?: string;
}

export interface DealStageHistoryRecord {
  id: number;
  dealId: number;
  previousStage: string;
  newStage: string;
  changedByUserId: number | null;
  changedAt: string;
  comment: string | null;
}

function normalizeDealStageHistoryRecord(raw: unknown): DealStageHistoryRecord | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r['id'] ?? r['Id']);
  const dealId = Number(r['dealId'] ?? r['DealId']);
  if (!Number.isFinite(id) || !Number.isFinite(dealId)) return null;
  const changedAt = String(r['changedAt'] ?? r['ChangedAt'] ?? '').trim();
  return {
    id: Math.trunc(id),
    dealId: Math.trunc(dealId),
    previousStage: String(r['previousStage'] ?? r['PreviousStage'] ?? '').trim(),
    newStage: String(r['newStage'] ?? r['NewStage'] ?? '').trim(),
    changedByUserId: (() => {
      const v = r['changedByUserId'] ?? r['ChangedByUserId'];
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
    changedAt: changedAt || new Date().toISOString(),
    comment: (() => {
      const c = r['comment'] ?? r['Comment'];
      return c != null && String(c).trim() ? String(c).trim() : null;
    })(),
  };
}

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

  list(query?: DealListQuery): Observable<DealNormalized[]> {
    let params = new HttpParams();
    if (query?.userId != null && query.userId > 0) {
      params = params.set('userId', String(query.userId));
    }
    const status = query?.status?.trim();
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params })
      .pipe(map((raw) => extractDealRecords(raw).map((item) => normalizeDealApiRecord(item))));
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
    const payload = stripDealUpsertForPost(body);
    return this.http
      .post<unknown>(this.baseUrl, payload, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeDealApiRecord(raw)));
  }

  put(id: number, body: DealUpsertDto, previous?: DealNormalized): Observable<DealNormalized> {
    const payload =
      previous != null ? buildDealPutJson(body, previous) : { ...body, id, nextStep: body.nextStep ?? '' };
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, payload, { headers: this.jsonHeaders() })
      .pipe(map((raw) => normalizeDealApiRecord(raw)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }

  getStageHistory(id: number): Observable<DealStageHistoryRecord[]> {
    const session = this.auth.user();
    const userId = session?.id;
    let params = new HttpParams();
    if (userId != null && Number(userId) > 0) {
      params = params.set('userId', String(userId));
    }
    return this.http
      .get<unknown>(`${this.baseUrl}/${id}/stage-history`, { headers: this.jsonHeaders(), params })
      .pipe(
        map((raw) => {
          const rows = Array.isArray(raw) ? raw : [];
          return rows
            .map((item) => normalizeDealStageHistoryRecord(item))
            .filter((row): row is DealStageHistoryRecord => row != null);
        }),
        catchError(() => of([])),
      );
  }

  patchStatus(
    id: number,
    patch: { status: string; dealStatusId?: number | null; comment?: string; lostReason?: string },
  ): Observable<DealNormalized> {
    const session = this.auth.user();
    const userId = session?.id;
    let params = new HttpParams();
    if (userId != null && Number(userId) > 0) {
      params = params.set('userId', String(userId));
    }
    const body: Record<string, unknown> = { status: patch.status };
    if (patch.dealStatusId != null && patch.dealStatusId > 0) {
      body['dealStatusId'] = patch.dealStatusId;
    }
    if (patch.comment?.trim()) {
      body['comment'] = patch.comment.trim();
    }
    if (patch.lostReason?.trim()) {
      body['lostReason'] = patch.lostReason.trim();
    }
    return this.http
      .patch<unknown>(`${this.baseUrl}/${id}/status`, body, {
        headers: this.jsonHeaders(),
        params,
      })
      .pipe(map((raw) => normalizeDealApiRecord(raw)));
  }
}

import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import type {
  DealStatusReorderItem,
  MasterFormEntitySlug,
  MasterFormRow,
  MasterFormSaveResult,
  MasterFormUpsertPayload,
} from '../models/master-form.models';

function extractRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
  }
  if (raw != null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', '$values']) {
      const v = o[k];
      if (Array.isArray(v)) {
        return v.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
      }
    }
  }
  return [];
}

function mapRow(raw: Record<string, unknown>): MasterFormRow | null {
  const id = Number(raw['id'] ?? raw['Id']);
  const name = String(raw['name'] ?? raw['Name'] ?? '').trim();
  if (!Number.isFinite(id) || id <= 0 || !name) return null;

  const description = String(raw['description'] ?? raw['Description'] ?? '').trim();
  const isActive = raw['isActive'] ?? raw['IsActive'];
  const createdRaw = raw['createdAt'] ?? raw['CreatedAt'];

  let createdAt: string | null = null;
  if (typeof createdRaw === 'string' && createdRaw.trim()) {
    createdAt = createdRaw.trim();
  }

  const sortOrderRaw = raw['sortOrder'] ?? raw['sort_order'] ?? raw['SortOrder'];
  const sortOrder =
    typeof sortOrderRaw === 'number' && Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : undefined;

  return {
    id: Math.trunc(id),
    name,
    description,
    isActive: isActive !== false && isActive !== 'false' && isActive !== 0,
    createdAt,
    sortOrder,
    isWon: raw['isWon'] === true || raw['is_won'] === true || raw['IsWon'] === true,
    isLost: raw['isLost'] === true || raw['is_lost'] === true || raw['IsLost'] === true,
    isConversionStatus:
      raw['isConversionStatus'] === true ||
      raw['is_conversion_status'] === true ||
      raw['IsConversionStatus'] === true,
  };
}

@Injectable({ providedIn: 'root' })
export class MasterFormsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  list(entity: MasterFormEntitySlug): Observable<MasterFormRow[]> {
    const base = this.apiBase();
    if (!base) return of([]);

    return this.http
      .get<unknown>(`${base}/master-data/${entity}`, { headers: this.jsonHeaders() })
      .pipe(
        timeout(30000),
        map((raw) =>
          extractRows(raw)
            .map((row) => mapRow(row))
            .filter((row): row is MasterFormRow => row != null),
        ),
        catchError(() => of([])),
      );
  }

  create(entity: MasterFormEntitySlug, payload: MasterFormUpsertPayload): Observable<MasterFormSaveResult> {
    return this.upsert(entity, 'POST', payload);
  }

  update(
    entity: MasterFormEntitySlug,
    id: number,
    payload: MasterFormUpsertPayload,
  ): Observable<MasterFormSaveResult> {
    return this.upsert(entity, 'PUT', { ...payload, id }, id);
  }

  reorderDealStatuses(items: DealStatusReorderItem[]): Observable<MasterFormSaveResult> {
    const base = this.apiBase();
    if (!base) {
      return of({ ok: false, error: 'API URL is not configured.' });
    }

    return this.http
      .put<unknown>(`${base}/master-data/deal-statuses/reorder`, { items }, { headers: this.jsonHeaders() })
      .pipe(
        timeout(15000),
        map((raw): MasterFormSaveResult => {
          const rows = extractRows(raw)
            .map((row) => mapRow(row))
            .filter((row): row is MasterFormRow => row != null);
          if (rows.length === 0) {
            return { ok: false, error: 'Unexpected response from server.' };
          }
          return { ok: true, row: rows[0] };
        }),
        catchError((err) => of(this.mapError(err))),
      );
  }

  setActive(
    entity: MasterFormEntitySlug,
    id: number,
    isActive: boolean,
  ): Observable<MasterFormSaveResult> {
    const base = this.apiBase();
    if (!base) {
      return of({ ok: false, error: 'API URL is not configured.' });
    }

    return this.http
      .patch<unknown>(`${base}/master-data/${entity}/${id}/active`, { isActive }, { headers: this.jsonHeaders() })
      .pipe(
        timeout(15000),
        map((raw): MasterFormSaveResult => {
          const row = raw && typeof raw === 'object' ? mapRow(raw as Record<string, unknown>) : null;
          if (!row) {
            return { ok: false, error: 'Unexpected response from server.' };
          }
          return { ok: true, row };
        }),
        catchError((err) => of(this.mapError(err))),
      );
  }

  private upsert(
    entity: MasterFormEntitySlug,
    method: 'POST' | 'PUT',
    payload: MasterFormUpsertPayload,
    id?: number,
  ): Observable<MasterFormSaveResult> {
    const base = this.apiBase();
    if (!base) {
      return of({ ok: false, error: 'API URL is not configured.' });
    }

    const body: Record<string, unknown> = {
      id: payload.id ?? 0,
      name: payload.name.trim(),
      description: payload.description.trim(),
      isActive: payload.isActive,
    };
    if (entity === 'deal-statuses') {
      if (payload.sortOrder != null && payload.sortOrder > 0) body['sortOrder'] = payload.sortOrder;
      if (payload.isWon != null) body['isWon'] = payload.isWon;
      if (payload.isLost != null) body['isLost'] = payload.isLost;
    }
    if (entity === 'lead-statuses' && payload.isConversionStatus != null) {
      body['isConversionStatus'] = payload.isConversionStatus;
    }

    const url =
      method === 'POST' ? `${base}/master-data/${entity}` : `${base}/master-data/${entity}/${id}`;

    const request$ =
      method === 'POST'
        ? this.http.post<unknown>(url, body, { headers: this.jsonHeaders() })
        : this.http.put<unknown>(url, body, { headers: this.jsonHeaders() });

    return request$.pipe(
      timeout(15000),
      map((raw): MasterFormSaveResult => {
        const row = raw && typeof raw === 'object' ? mapRow(raw as Record<string, unknown>) : null;
        if (!row) {
          return { ok: false, error: 'Unexpected response from server.' };
        }
        return { ok: true, row };
      }),
      catchError((err) => of(this.mapError(err))),
    );
  }

  private mapError(err: unknown): MasterFormSaveResult {
    if (!(err instanceof HttpErrorResponse)) {
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
    if (err.status === 403) {
      return { ok: false, error: 'Only admins can manage master forms.' };
    }
    const detail = this.httpErrorDetail(err);
    if (detail) {
      return { ok: false, error: detail.slice(0, 220) };
    }
    if (err.status === 409) {
      return { ok: false, error: 'A record with this name already exists.' };
    }
    return { ok: false, error: 'Could not save. Please try again.' };
  }

  private httpErrorDetail(err: HttpErrorResponse): string | null {
    const body = err.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      for (const key of ['message', 'Message', 'title', 'Title', 'detail', 'Detail']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return err.message?.trim() || null;
  }

  private apiBase(): string | null {
    const base = environment.apiUrl?.replace(/\/$/, '') ?? '';
    return base.trim() ? base : null;
  }

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' });
    const token = this.auth.token();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`);
    }
    return h;
  }
}

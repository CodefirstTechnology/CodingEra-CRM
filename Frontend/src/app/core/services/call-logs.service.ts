import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { CallLogRow } from '../../features/call-logs/call-logs.component';
import { normalizeCallLogRow } from '../../shared/utils/normalize-local-rows';

/** Parses `GET …/callLogs/GetCalls` whether the API returns a bare array or a wrapper object. */
function extractCallLogRecords(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x));
  }
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = [
      'data',
      'items',
      'value',
      'result',
      'calls',
      'callLogs',
      'Data',
      'Items',
      'CallLogs',
      '$values',
    ];
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) {
        return v.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x));
      }
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        const rows = v.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x));
        if (rows.length > 0) return rows;
      }
    }
  }
  return [];
}

/**
 * Maps the CRM UI model to the .NET `AddCall` / `CallLog` contract (Swagger field names).
 * - Omit `lastModified` on create (server sets it; `"Just now"` causes 400).
 * - `callStarted` must be UTC ISO (`timestamp with time zone` on PostgreSQL).
 * - UI total `durationSeconds` → API `durationMinutes` + `durationSeconds` parts.
 */
function toAddCallApiBody(data: Omit<CallLogRow, 'id'>): Record<string, unknown> {
  const totalSec = Math.max(0, Math.floor(Number(data.durationSeconds) || 0));
  const durationMinutes = Math.floor(totalSec / 60);
  const durationSecondsPart = totalSec % 60;

  const toIntOrZero = (v: string | undefined): number => {
    if (v == null || String(v).trim() === '') return 0;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };

  return {
    callId: 0,
    direction: data.direction,
    phoneNumber: data.phoneNumber ?? '',
    contactCompany: '',
    contactName: data.contactName ?? '',
    callStarted: toUtcIsoDateTime(data.startedAt),
    durationMinutes,
    durationSeconds: durationSecondsPart,
    outcome: data.outcome ?? '',
    summary: data.summary ?? '',
    contactId: 0,
    relatedLeadId: toIntOrZero(data.relatedLeadId),
    relatedDealId: toIntOrZero(data.relatedDealId),
  };
}

/** `datetime-local` and other local strings → UTC ISO for the API. */
function toUtcIsoDateTime(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/** Builds a single record after `POST …/AddCall` (entity, wrapper, or id-only). */
function mergeAddCallResponse(raw: unknown, sent: Omit<CallLogRow, 'id'>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...sent };
  if (raw == null || raw === '') {
    return base;
  }
  if (typeof raw === 'number' || typeof raw === 'string') {
    return { ...base, id: raw };
  }
  if (Array.isArray(raw) && raw[0] != null && typeof raw[0] === 'object') {
    return { ...base, ...(raw[0] as Record<string, unknown>) };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const inner = o['data'] ?? o['Data'] ?? o['result'] ?? o['Result'] ?? o['callLog'] ?? o['CallLog'];
    if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
      return { ...base, ...(inner as Record<string, unknown>) };
    }
    return { ...base, ...o };
  }
  return base;
}

@Injectable({ providedIn: 'root' })
export class CallLogsService {
  private readonly http = inject(HttpClient);

  private readonly apiBase = `${environment.apiUrl}/callLogs`;

  getAll(): Observable<CallLogRow[]> {
    return this.http.get<unknown>(`${this.apiBase}/GetCalls`).pipe(
      map((raw) => extractCallLogRecords(raw).map((row) => normalizeCallLogRow(row))),
    );
  }

  getById(id: number): Observable<CallLogRow | null> {
    return this.getAll().pipe(
      map((rows) => rows.find((r) => Number(r.id) === id || String(r.id) === String(id)) ?? null),
      take(1),
    );
  }

  create(data: Omit<CallLogRow, 'id'>): Observable<CallLogRow> {
    return this.http.post<unknown>(`${this.apiBase}/AddCall`, toAddCallApiBody(data)).pipe(
      map((raw) => normalizeCallLogRow(mergeAddCallResponse(raw, data))),
    );
  }

  update(id: number, data: Partial<Omit<CallLogRow, 'id'>>): Observable<CallLogRow | null> {
    const patch = toAddCallApiBody(data as Omit<CallLogRow, 'id'>);
    patch['callId'] = id;
    return this.http.put<unknown>(`${this.apiBase}/UpdateCall/${id}`, patch).pipe(
      map((raw) => normalizeCallLogRow(mergeAddCallResponse(raw, data as Omit<CallLogRow, 'id'>))),
    ) as Observable<CallLogRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/DeleteCall/${id}`);
  }
}

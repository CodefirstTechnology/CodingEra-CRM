import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

function extractMasterDataRows(raw: unknown): Record<string, unknown>[] {
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

/** Row from `GET /api/MasterData/*` for dropdowns (salutations, territories, …). */
export interface MasterDataOption {
  id: number;
  name: string;
  /** Pipeline position from deal-status master (`sort_order`). */
  sortOrder?: number;
  /** Terminal won flag from deal-status master. */
  isWon?: boolean;
  /** Terminal lost flag from deal-status master. */
  isLost?: boolean;
}

@Injectable({ providedIn: 'root' })
export class LeadMasterDataService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private leadStatusMap$?: Observable<Map<string, number>>;
  private readonly optionsCache = new Map<string, Observable<MasterDataOption[]>>();

  /** Maps pipeline label (e.g. `New`, `Contacted`) → `leadStatusId` for POST /api/leads. */
  loadLeadStatusIds(): Observable<Map<string, number>> {
    if (!this.leadStatusMap$) {
      const base = environment.apiUrl?.replace(/\/$/, '') ?? '';
      const url = `${base}/MasterData/lead-statuses`;
      this.leadStatusMap$ = this.http
        .get<unknown>(url, {
          params: new HttpParams().set('activeOnly', 'true'),
          headers: this.jsonHeaders(),
        })
        .pipe(
          map((raw) => {
            const map = new Map<string, number>();
            for (const row of extractMasterDataRows(raw)) {
              const id = Number(row['id']);
              const name = String(row['name'] ?? row['description'] ?? '')
                .trim()
                .toLowerCase();
              if (Number.isFinite(id) && id > 0 && name) {
                map.set(name, Math.trunc(id));
              }
            }
            return map;
          }),
          tap((m) => {
            if (m.size === 0) {
              console.warn('[LeadMasterData] No lead statuses returned; POST /api/leads may fail.');
            }
          }),
          catchError((err) => {
            console.warn('[LeadMasterData] Failed to load lead statuses', err);
            return of(
              new Map<string, number>([
                ['new', 1],
                ['contacted', 2],
                ['nurture', 3],
                ['unqualified', 4],
                ['qualified', 5],
                ['junk', 6],
              ]),
            );
          }),
          shareReplay(1),
        );
    }
    return this.leadStatusMap$;
  }

  resolveLeadStatusId(statusName: string, map: Map<string, number>): number | null {
    const key = statusName.trim().toLowerCase();
    if (!key) return map.get('new') ?? null;
    const direct = map.get(key);
    if (direct != null) return direct;
    if (key === 'lost') {
      return map.get('unqualified') ?? map.get('lost') ?? map.get('new') ?? null;
    }
    if (key === 'converted') {
      return map.get('qualified') ?? map.get('converted') ?? map.get('new') ?? null;
    }
    return map.get('new') ?? [...map.values()][0] ?? null;
  }

  /** Active salutations for lead forms (`/api/MasterData/salutations`). */
  loadSalutations(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('salutations');
  }

  /** Active employee-count buckets for org linkage (`/api/MasterData/employee-counts`). */
  loadEmployeeCounts(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('employee-counts');
  }

  /** Active territories (`/api/MasterData/territories`). */
  loadTerritories(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('territories');
  }

  /** Active request types (`/api/MasterData/request-types`). */
  loadRequestTypes(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('request-types');
  }

  /** Active industries (`/api/MasterData/industries`). */
  loadIndustries(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('industries');
  }

  /** Active lead pipeline statuses for dropdowns (`/api/MasterData/lead-statuses`). */
  loadLeadStatuses(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('lead-statuses');
  }

  /** Active deal pipeline statuses for dropdowns (`/api/MasterData/deal-statuses`). */
  loadDealStatuses(): Observable<MasterDataOption[]> {
    return this.loadMasterOptions('deal-statuses');
  }

  private loadMasterOptions(segment: string): Observable<MasterDataOption[]> {
    let cached = this.optionsCache.get(segment);
    if (!cached) {
      cached = this.fetchMasterOptions(segment).pipe(shareReplay(1));
      this.optionsCache.set(segment, cached);
    }
    return cached;
  }

  private fetchMasterOptions(segment: string): Observable<MasterDataOption[]> {
    const base = environment.apiUrl?.replace(/\/$/, '') ?? '';
    if (!base.trim()) {
      return of([]);
    }
    const url = `${base}/MasterData/${segment}`;
    return this.http
      .get<unknown>(url, {
        params: new HttpParams().set('activeOnly', 'true'),
        headers: this.jsonHeaders(),
      })
      .pipe(
        map((raw) =>
          extractMasterDataRows(raw)
            .map((row) => ({
              id: Number(row['id']),
              name: String(row['name'] ?? row['description'] ?? '').trim(),
              sortOrder: Number(row['sortOrder'] ?? row['sort_order'] ?? 0) || undefined,
              isWon: row['isWon'] === true || row['is_won'] === true || row['IsWon'] === true,
              isLost: row['isLost'] === true || row['is_lost'] === true || row['IsLost'] === true,
            }))
            .filter((o) => Number.isFinite(o.id) && o.id > 0 && o.name.length > 0),
        ),
        catchError((err) => {
          console.warn(`[LeadMasterData] ${segment} failed`, err);
          return of([]);
        }),
      );
  }

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({ Accept: 'application/json' });
    const token = this.auth.token();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`);
    }
    return h;
  }
}

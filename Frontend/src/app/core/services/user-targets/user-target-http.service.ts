import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type {
  UserTargetMonitorQuery,
  UserTargetRow,
  UserTargetSalesUser,
  UserTargetType,
  UserTargetUpsert,
  UserTargetWidget,
} from './user-target-api.models';
import {
  mapUserTargetRow,
  mapUserTargetRows,
  mapUserTargetSalesUser,
  mapUserTargetType,
  mapUserTargetWidget,
  toUserTargetBody,
} from './user-target-api.mapper';

@Injectable({ providedIn: 'root' })
export class UserTargetHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/user-targets`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  listTypes(): Observable<UserTargetType[]> {
    return this.http
      .get<unknown[]>(`${this.baseUrl}/types`, { headers: this.jsonHeaders() })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapUserTargetType)));
  }

  listSalesUsers(): Observable<UserTargetSalesUser[]> {
    return this.http
      .get<unknown[]>(`${this.baseUrl}/sales-users`, { headers: this.jsonHeaders() })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapUserTargetSalesUser)));
  }

  listTargets(includeInactive = true): Observable<UserTargetRow[]> {
    const params = new HttpParams().set('includeInactive', String(includeInactive));
    return this.http
      .get<unknown>(`${this.baseUrl}`, { headers: this.jsonHeaders(), params })
      .pipe(map(mapUserTargetRows));
  }

  listMonitor(query: UserTargetMonitorQuery): Observable<UserTargetRow[]> {
    let params = new HttpParams();
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.userId) params = params.set('userId', String(query.userId));
    if (query.targetTypeId) params = params.set('targetTypeId', String(query.targetTypeId));
    if (query.isActive != null) params = params.set('isActive', String(query.isActive));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);
    return this.http
      .get<unknown>(`${this.baseUrl}/monitor`, { headers: this.jsonHeaders(), params })
      .pipe(map(mapUserTargetRows));
  }

  listMyWidgets(): Observable<UserTargetWidget[]> {
    return this.http
      .get<unknown[]>(`${this.baseUrl}/my-widgets`, { headers: this.jsonHeaders() })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapUserTargetWidget)));
  }

  create(dto: UserTargetUpsert): Observable<UserTargetRow> {
    return this.http
      .post<unknown>(`${this.baseUrl}`, toUserTargetBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapUserTargetRow));
  }

  update(id: number, dto: UserTargetUpsert): Observable<UserTargetRow> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, toUserTargetBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapUserTargetRow));
  }

  setActive(id: number, isActive: boolean): Observable<UserTargetRow> {
    return this.http
      .patch<unknown>(`${this.baseUrl}/${id}/status`, { isActive }, { headers: this.jsonHeaders() })
      .pipe(map(mapUserTargetRow));
  }
}

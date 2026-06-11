import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type {
  LeadSyncManualLog,
  LeadSyncUpdateAssignments,
  LeadSyncUpdateAutoSync,
} from './lead-sync-api.models';
import {
  mapLeadSyncEligibleUser,
  mapLeadSyncIntervalOption,
  mapLeadSyncLogRows,
  mapLeadSyncMyAccessList,
  mapLeadSyncSource,
  mapLeadSyncSources,
} from './lead-sync-api.mapper';

@Injectable({ providedIn: 'root' })
export class LeadSyncHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/lead-sync-management`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  listIntervals(): Observable<ReturnType<typeof mapLeadSyncIntervalOption>[]> {
    return this.http
      .get<unknown[]>(`${this.baseUrl}/intervals`, { headers: this.jsonHeaders() })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapLeadSyncIntervalOption)));
  }

  listEligibleUsers(): Observable<ReturnType<typeof mapLeadSyncEligibleUser>[]> {
    return this.http
      .get<unknown[]>(`${this.baseUrl}/eligible-users`, { headers: this.jsonHeaders() })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapLeadSyncEligibleUser)));
  }

  listSources(): Observable<ReturnType<typeof mapLeadSyncSources>> {
    return this.http
      .get<unknown>(`${this.baseUrl}/sources`, { headers: this.jsonHeaders() })
      .pipe(map(mapLeadSyncSources));
  }

  listMyAccess(): Observable<ReturnType<typeof mapLeadSyncMyAccessList>> {
    return this.http
      .get<unknown>(`${this.baseUrl}/my-access`, { headers: this.jsonHeaders() })
      .pipe(map(mapLeadSyncMyAccessList));
  }

  updateAssignments(sourceId: number, body: LeadSyncUpdateAssignments) {
    return this.http
      .put<unknown>(`${this.baseUrl}/sources/${sourceId}/assignments`, body, {
        headers: this.jsonHeaders(),
      })
      .pipe(map(mapLeadSyncSources));
  }

  updateAutoSync(sourceId: number, body: LeadSyncUpdateAutoSync) {
    return this.http
      .put<unknown>(`${this.baseUrl}/sources/${sourceId}/auto-sync`, body, {
        headers: this.jsonHeaders(),
      })
      .pipe(map(mapLeadSyncSources));
  }

  recordManualLog(body: LeadSyncManualLog): Observable<{ recorded: boolean }> {
    return this.http.post<{ recorded: boolean }>(`${this.baseUrl}/manual-log`, body, {
      headers: this.jsonHeaders(),
    });
  }

  listHistory(sourceId?: number, limit = 50) {
    let params = new HttpParams().set('limit', String(limit));
    if (sourceId != null && sourceId > 0) {
      params = params.set('sourceId', String(sourceId));
    }
    return this.http
      .get<unknown>(`${this.baseUrl}/history`, { headers: this.jsonHeaders(), params })
      .pipe(map(mapLeadSyncLogRows));
  }
}

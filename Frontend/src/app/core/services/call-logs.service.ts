import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CallLogRow } from '../../features/call-logs/call-logs.component';
import { normalizeCallLogRow } from '../../shared/utils/normalize-local-rows';
import { LocalDataService } from './local-data.service';

function mapCallLog(row: Record<string, unknown>): CallLogRow {
  return normalizeCallLogRow(row);
}

@Injectable({ providedIn: 'root' })
export class CallLogsService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<CallLogRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('callLogs').map(mapCallLog));
    }
    return this.http.get<CallLogRow[]>(`${environment.apiUrl}/call-logs`);
  }

  getById(id: number): Observable<CallLogRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('callLogs', id);
      return of(row ? mapCallLog(row) : null);
    }
    return this.http.get<CallLogRow>(`${environment.apiUrl}/call-logs/${id}`) as Observable<CallLogRow | null>;
  }

  create(data: Omit<CallLogRow, 'id'>): Observable<CallLogRow> {
    if (environment.useMockData) {
      return of(mapCallLog(this.local.create('callLogs', data as Record<string, unknown>)));
    }
    return this.http.post<CallLogRow>(`${environment.apiUrl}/call-logs`, data);
  }

  update(id: number, data: Partial<Omit<CallLogRow, 'id'>>): Observable<CallLogRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('callLogs', id, data as Record<string, unknown>);
      return of(row ? mapCallLog(row) : null);
    }
    return this.http.put<CallLogRow>(`${environment.apiUrl}/call-logs/${id}`, data) as Observable<CallLogRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('callLogs', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/call-logs/${id}`);
  }
}

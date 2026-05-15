import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CallLogRow } from '../../features/call-logs/call-logs.component';

@Injectable({ providedIn: 'root' })
export class CallLogsService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<CallLogRow[]> {
    return this.http.get<CallLogRow[]>(`${environment.apiUrl}/call-logs`);
  }

  getById(id: number): Observable<CallLogRow | null> {
    return this.http.get<CallLogRow>(`${environment.apiUrl}/call-logs/${id}`) as Observable<CallLogRow | null>;
  }

  create(data: Omit<CallLogRow, 'id'>): Observable<CallLogRow> {
    return this.http.post<CallLogRow>(`${environment.apiUrl}/call-logs`, data);
  }

  update(id: number, data: Partial<Omit<CallLogRow, 'id'>>): Observable<CallLogRow | null> {
    return this.http.put<CallLogRow>(`${environment.apiUrl}/call-logs/${id}`, data) as Observable<CallLogRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/call-logs/${id}`);
  }
}

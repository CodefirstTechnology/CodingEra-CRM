import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { TaskRow } from '../../../features/tasks/tasks.component';
import {
  extractTaskRecords,
  mapTaskApiRecord,
  taskRowToUpsertDto,
} from './task-api.mapper';

export interface TaskListQuery {
  userId?: number;
  relatedLeadId?: number;
  relatedDealId?: number;
}

@Injectable({ providedIn: 'root' })
export class TaskHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/tasks`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(query?: TaskListQuery): Observable<TaskRow[]> {
    let params = new HttpParams();
    if (query?.userId != null && query.userId > 0) {
      params = params.set('userId', String(query.userId));
    }
    if (query?.relatedLeadId != null && query.relatedLeadId > 0) {
      params = params.set('relatedLeadId', String(query.relatedLeadId));
    }
    if (query?.relatedDealId != null && query.relatedDealId > 0) {
      params = params.set('relatedDealId', String(query.relatedDealId));
    }

    return this.http.get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params }).pipe(
      map((raw) => extractTaskRecords(raw).map((item) => mapTaskApiRecord(item))),
    );
  }

  getById(id: number): Observable<TaskRow | null> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() })
      .pipe(map((raw) => (raw != null ? mapTaskApiRecord(raw) : null)));
  }

  create(data: Omit<TaskRow, 'id'>): Observable<TaskRow> {
    const body = taskRowToUpsertDto(data);
    return this.http
      .post<unknown>(this.baseUrl, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapTaskApiRecord(raw)));
  }

  update(id: number, data: Omit<TaskRow, 'id'>): Observable<TaskRow | null> {
    const body = taskRowToUpsertDto(data, id);
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() })
      .pipe(map((raw) => (raw != null ? mapTaskApiRecord(raw) : null)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }
}

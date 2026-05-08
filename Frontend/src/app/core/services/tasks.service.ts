import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TaskRow } from '../../features/tasks/tasks.component';
import { normalizeTaskRow } from '../../shared/utils/normalize-local-rows';
import { LocalDataService } from './local-data.service';

function mapTask(row: Record<string, unknown>): TaskRow {
  return normalizeTaskRow(row);
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<TaskRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('tasks').map(mapTask));
    }
    return this.http.get<TaskRow[]>(`${environment.apiUrl}/tasks`);
  }

  getById(id: number): Observable<TaskRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('tasks', id);
      return of(row ? mapTask(row) : null);
    }
    return this.http.get<TaskRow>(`${environment.apiUrl}/tasks/${id}`) as Observable<TaskRow | null>;
  }

  create(data: Omit<TaskRow, 'id'>): Observable<TaskRow> {
    if (environment.useMockData) {
      return of(mapTask(this.local.create('tasks', data as Record<string, unknown>)));
    }
    return this.http.post<TaskRow>(`${environment.apiUrl}/tasks`, data);
  }

  update(id: number, data: Partial<Omit<TaskRow, 'id'>>): Observable<TaskRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('tasks', id, data as Record<string, unknown>);
      return of(row ? mapTask(row) : null);
    }
    return this.http.put<TaskRow>(`${environment.apiUrl}/tasks/${id}`, data) as Observable<TaskRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('tasks', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/tasks/${id}`);
  }
}

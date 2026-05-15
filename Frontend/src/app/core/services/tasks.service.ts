import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TaskRow } from '../../features/tasks/tasks.component';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<TaskRow[]> {
    return this.http.get<TaskRow[]>(`${environment.apiUrl}/tasks`);
  }

  getById(id: number): Observable<TaskRow | null> {
    return this.http.get<TaskRow>(`${environment.apiUrl}/tasks/${id}`) as Observable<TaskRow | null>;
  }

  create(data: Omit<TaskRow, 'id'>): Observable<TaskRow> {
    return this.http.post<TaskRow>(`${environment.apiUrl}/tasks`, data);
  }

  update(id: number, data: Partial<Omit<TaskRow, 'id'>>): Observable<TaskRow | null> {
    return this.http.put<TaskRow>(`${environment.apiUrl}/tasks/${id}`, data) as Observable<TaskRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/tasks/${id}`);
  }
}

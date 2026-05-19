import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { TaskRow } from '../../features/tasks/tasks.component';
import { filterTasksForUser } from '../../features/user-dashboard/utils/user-ownership.util';
import { TaskHttpService } from './tasks/task-http.service';
import { extractTaskRecords, mapTaskApiRecord } from './tasks/task-api.mapper';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly taskHttp = inject(TaskHttpService);

  private mapList(raw: unknown): TaskRow[] {
    return extractTaskRecords(raw).map((item) => mapTaskApiRecord(item));
  }

  getAll(): Observable<TaskRow[]> {
    return this.taskHttp.list();
  }

  /** Tasks where `assignedToUserId` = logged-in user. */
  getAssignedToUser(
    userId: string,
    userName = '',
    userEmail = '',
  ): Observable<TaskRow[]> {
    const numericId = Number(userId);
    const query =
      Number.isFinite(numericId) && numericId > 0
        ? { assignedToUserId: Math.trunc(numericId) }
        : undefined;

    return this.taskHttp.list(query).pipe(
      catchError(() => this.taskHttp.list()),
      map((rows) => filterTasksForUser(rows, userId, userName, userEmail)),
    );
  }

  getById(id: number): Observable<TaskRow | null> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/tasks/${id}`)
      .pipe(map((raw) => (raw != null ? mapTaskApiRecord(raw) : null)));
  }

  create(data: Omit<TaskRow, 'id'>): Observable<TaskRow> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/tasks`, data)
      .pipe(map((raw) => mapTaskApiRecord(raw)));
  }

  update(id: number, data: Partial<Omit<TaskRow, 'id'>>): Observable<TaskRow | null> {
    return this.http
      .put<unknown>(`${environment.apiUrl}/tasks/${id}`, data)
      .pipe(map((raw) => (raw != null ? mapTaskApiRecord(raw) : null)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/tasks/${id}`);
  }
}

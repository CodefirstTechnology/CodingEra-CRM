import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { TaskRow } from '../../../features/tasks/tasks.component';
import { extractTaskRecords, mapTaskApiRecord } from './task-api.mapper';

export interface TaskListQuery {
  /** `users.id` — tasks assigned to this user. */
  assignedToUserId?: number;
  userId?: number;
  leadOwnerId?: number;
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
    const uid = query?.assignedToUserId ?? query?.userId;
    if (uid != null && uid > 0) {
      params = params
        .set('assignedToUserId', String(uid))
        .set('userId', String(uid))
        .set('assignedUserId', String(uid));
    }
    if (query?.leadOwnerId != null && query.leadOwnerId > 0) {
      params = params.set('leadOwnerId', String(query.leadOwnerId));
    }

    return this.http.get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params }).pipe(
      map((raw) => extractTaskRecords(raw).map((item) => mapTaskApiRecord(item))),
    );
  }
}

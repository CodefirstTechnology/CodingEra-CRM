import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { ActivityEntityType } from '../activities/activity-api.models';
import { mapCommentApiRecord, mapCommentList } from './comment-api.mapper';
import type { CommentListQuery, CommentUpsertDto, EntityCommentItem } from './comment-api.models';

@Injectable({ providedIn: 'root' })
export class CommentHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/comments`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(
    query: CommentListQuery,
    resolveAuthorName?: (authorId: number | null) => string,
  ): Observable<EntityCommentItem[]> {
    let params = new HttpParams()
      .set('entityType', query.entityType)
      .set('entityId', String(query.entityId));
    if (query.userId != null && query.userId > 0) {
      params = params.set('userId', String(query.userId));
    }

    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params })
      .pipe(map((raw) => mapCommentList(raw, resolveAuthorName)));
  }

  create(
    body: CommentUpsertDto,
    resolveAuthorName?: (authorId: number | null) => string,
  ): Observable<EntityCommentItem> {
    return this.http.post<unknown>(this.baseUrl, body, { headers: this.jsonHeaders() }).pipe(
      map((raw) => {
        const row = mapCommentApiRecord(raw, resolveAuthorName);
        if (!row) throw new Error('Invalid comment response from server.');
        return row;
      }),
    );
  }

  update(
    id: number,
    body: CommentUpsertDto,
    resolveAuthorName?: (authorId: number | null) => string,
  ): Observable<EntityCommentItem> {
    return this.http.put<unknown>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() }).pipe(
      map((raw) => {
        const row = mapCommentApiRecord(raw, resolveAuthorName);
        if (!row) throw new Error('Invalid comment response from server.');
        return row;
      }),
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }

  listForEntity(entityType: ActivityEntityType, entityId: number): Observable<EntityCommentItem[]> {
    return this.list({ entityType, entityId });
  }
}

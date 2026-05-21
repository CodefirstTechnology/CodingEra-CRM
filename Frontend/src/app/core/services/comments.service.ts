import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { AdminUsersService, type AdminUserRow } from './admin-users.service';
import { initialsFromDisplayName } from './leads/lead-owner-options.service';
import type { ActivityEntityType } from './activities/activity-api.models';
import type { CommentUpsertDto, EntityCommentItem } from './comments/comment-api.models';
import { CommentHttpService } from './comments/comment-http.service';

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly commentHttp = inject(CommentHttpService);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);

  listForEntity(entityType: ActivityEntityType, entityId: number): Observable<EntityCommentItem[]> {
    return this.withAuthorResolver((resolve) =>
      this.commentHttp.list({ entityType, entityId }, resolve).pipe(
        map((rows) => rows.map((row) => this.enrichCommentAuthor(row, resolve))),
      ),
    );
  }

  createForEntity(
    entityType: ActivityEntityType,
    entityId: number,
    body: string,
  ): Observable<EntityCommentItem> {
    const authorId = this.currentUserId();
    const payload: CommentUpsertDto = {
      entityType,
      entityId,
      body: body.trim(),
      authorId,
    };

    return this.withAuthorResolver((resolve) =>
      this.commentHttp.create(payload, resolve).pipe(
        map((row) => this.enrichCommentAuthor(row, resolve)),
      ),
    );
  }

  private withAuthorResolver<T>(
    project: (resolve: (authorId: number | null) => string) => Observable<T>,
  ): Observable<T> {
    return this.adminUsers.listUsers(this.auth.token()).pipe(
      catchError(() => of([] as AdminUserRow[])),
      switchMap((users) => {
        const resolve = (authorId: number | null) => this.resolveAuthorName(users, authorId);
        return project(resolve);
      }),
    );
  }

  private enrichCommentAuthor(
    row: EntityCommentItem,
    resolve: (authorId: number | null) => string,
  ): EntityCommentItem {
    const authorName = row.authorName.startsWith('User #')
      ? resolve(row.authorId)
      : row.authorName;
    return {
      ...row,
      authorName,
      authorInitial: initialsFromDisplayName(authorName),
    };
  }

  private resolveAuthorName(users: AdminUserRow[], authorId: number | null): string {
    if (authorId == null) return 'User';

    const session = this.auth.user();
    const sessionId = session?.id?.trim();
    if (sessionId && Number(sessionId) === authorId) {
      const sessionName = session?.name?.trim();
      if (sessionName) return sessionName;
    }

    const match = users.find((u) => Number(u.id) === authorId);
    if (match?.name?.trim()) return match.name.trim();

    return `User #${authorId}`;
  }

  private currentUserId(): number | null {
    const raw = this.auth.user()?.id?.trim();
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
}

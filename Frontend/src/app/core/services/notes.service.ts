import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { NoteRow } from '../../features/notes/notes.component';
import {
  filterNotesForUser,
} from '../../features/user-dashboard/utils/user-ownership.util';
import { AuthService } from '../auth/auth.service';
import { AdminUsersService, type AdminUserRow } from './admin-users.service';
import { NoteHttpService } from './notes/note-http.service';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly noteHttp = inject(NoteHttpService);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);

  getAll(): Observable<NoteRow[]> {
    return this.enrichRows(this.noteHttp.list());
  }

  getById(id: number): Observable<NoteRow | null> {
    return this.enrichRows(this.noteHttp.list()).pipe(
      map((rows) => rows.find((r) => Number(r.id) === id) ?? null),
    );
  }

  getByRecord(recordId: number): Observable<NoteRow[]> {
    return this.enrichRows(this.noteHttp.listByRecord(recordId));
  }

  /** Notes by author or linked to the user's leads/deals. */
  getAssignedToUser(
    userId: string,
    userName: string,
    userEmail: string,
    leadIds: ReadonlySet<string>,
    dealIds: ReadonlySet<string>,
  ): Observable<NoteRow[]> {
    const numericId = Number(userId);
    const query =
      Number.isFinite(numericId) && numericId > 0 ? { userId: Math.trunc(numericId) } : undefined;

    return this.enrichRows(
      this.noteHttp.list(query).pipe(catchError(() => this.noteHttp.list())),
    ).pipe(
      map((rows) => filterNotesForUser(rows, userId, userName, userEmail, leadIds, dealIds)),
    );
  }

  create(data: Omit<NoteRow, 'id'>): Observable<NoteRow> {
    const payload: Omit<NoteRow, 'id'> = {
      ...data,
      authorUserId: data.authorUserId ?? this.currentUserIdString(),
    };
    return this.enrichRow(this.noteHttp.create(payload));
  }

  update(id: number, data: Partial<Omit<NoteRow, 'id'>>): Observable<NoteRow | null> {
    return this.enrichRow(this.noteHttp.update(id, data)).pipe(map((row) => row ?? null));
  }

  delete(id: number): Observable<void> {
    return this.noteHttp.delete(id);
  }

  private enrichRows(source: Observable<NoteRow[]>): Observable<NoteRow[]> {
    return this.withUsers((users) =>
      source.pipe(map((rows) => rows.map((row) => this.enrichNote(row, users)))),
    );
  }

  private enrichRow(source: Observable<NoteRow>): Observable<NoteRow> {
    return this.withUsers((users) => source.pipe(map((row) => this.enrichNote(row, users))));
  }

  private withUsers<T>(project: (users: AdminUserRow[]) => Observable<T>): Observable<T> {
    return this.adminUsers.listUsers(this.auth.token()).pipe(
      catchError(() => of([] as AdminUserRow[])),
      switchMap((users) => project(users)),
    );
  }

  private enrichNote(row: NoteRow, users: AdminUserRow[]): NoteRow {
    const author = this.resolveAuthorName(row, users);
    return author === row.author ? row : { ...row, author };
  }

  private resolveAuthorName(row: NoteRow, users: AdminUserRow[]): string {
    const current = row.author?.trim();
    if (current && current !== '—' && !current.startsWith('User #')) return current;

    const authorId = row.authorUserId ? Number(row.authorUserId) : null;
    if (authorId != null && Number.isFinite(authorId)) {
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

    return current && current !== '—' ? current : 'Unknown';
  }

  private currentUserIdString(): string | undefined {
    const raw = this.auth.user()?.id?.trim();
    if (!raw || !/^\d+$/.test(raw)) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : undefined;
  }
}

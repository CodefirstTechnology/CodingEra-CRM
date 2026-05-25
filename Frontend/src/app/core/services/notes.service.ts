import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { NoteRow } from '../../features/notes/notes.component';
import {
  filterNotesForUser,
} from '../../features/user-dashboard/utils/user-ownership.util';
import { AuthService } from '../auth/auth.service';
import { AdminUsersService, type AdminUserRow } from './admin-users.service';
import { DealsService } from './deals.service';
import { LeadsService } from './leads.service';
import { NoteHttpService } from './notes/note-http.service';
import { dealActivityDisplayName } from '../../shared/utils/activity-entity-display.util';
import {
  attachRelatedDealName,
  attachRelatedLeadName,
  buildLeadNameByIdMap,
  resolveNoteRelatedDealId,
  resolveNoteRelatedLeadId,
} from '../../shared/utils/lead-person-name.util';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly noteHttp = inject(NoteHttpService);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);

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
      forkJoin({
        leads: this.leadsService.getAll().pipe(catchError(() => of([]))),
        deals: this.dealsService.getAll().pipe(catchError(() => of([]))),
      }).pipe(
        switchMap(({ leads, deals }) => {
          const leadNames = buildLeadNameByIdMap(leads);
          const dealNames = new Map<string, string>();
          for (const deal of deals) {
            const id = String(deal.id).trim();
            if (id) dealNames.set(id, dealActivityDisplayName(deal));
          }
          return source.pipe(
            map((rows) => rows.map((row) => this.enrichNoteRecord(row, users, leadNames, dealNames))),
          );
        }),
      ),
    );
  }

  private enrichRow(source: Observable<NoteRow>): Observable<NoteRow> {
    return this.withUsers((users) =>
      forkJoin({
        leads: this.leadsService.getAll().pipe(catchError(() => of([]))),
        deals: this.dealsService.getAll().pipe(catchError(() => of([]))),
      }).pipe(
        switchMap(({ leads, deals }) => {
          const leadNames = buildLeadNameByIdMap(leads);
          const dealNames = new Map<string, string>();
          for (const deal of deals) {
            const id = String(deal.id).trim();
            if (id) dealNames.set(id, dealActivityDisplayName(deal));
          }
          return source.pipe(
            map((row) => this.enrichNoteRecord(row, users, leadNames, dealNames)),
          );
        }),
      ),
    );
  }

  private enrichNoteRecord(
    row: NoteRow,
    users: AdminUserRow[],
    leadNames: Map<string, string>,
    dealNames: Map<string, string>,
  ): NoteRow {
    let enriched = attachRelatedLeadName(
      this.enrichNote(row, users),
      resolveNoteRelatedLeadId(row),
      leadNames,
    );
    enriched = attachRelatedDealName(enriched, resolveNoteRelatedDealId(row), dealNames);
    return enriched;
  }

  private withUsers<T>(project: (users: AdminUserRow[]) => Observable<T>): Observable<T> {
    return this.adminUsers.listUsers(this.auth.token()).pipe(
      catchError(() => of([] as AdminUserRow[])),
      switchMap((users) => project(users)),
    );
  }

  private enrichNote(row: NoteRow, users: AdminUserRow[]): NoteRow {
    const author = this.resolveUserDisplayName(row.author, row.authorUserId, users);
    const assignedBy = this.resolveUserDisplayName(
      row.assignedBy,
      row.updatedByUserId ?? row.authorUserId,
      users,
    );
    if (author === row.author && assignedBy === row.assignedBy) return row;
    return { ...row, author, assignedBy };
  }

  private resolveUserDisplayName(
    currentLabel: string | undefined,
    userIdRaw: string | undefined,
    users: AdminUserRow[],
  ): string {
    const current = currentLabel?.trim();
    if (current && current !== '—' && !current.startsWith('User #')) return current;

    const userId = userIdRaw ? Number(userIdRaw) : null;
    if (userId != null && Number.isFinite(userId) && userId > 0) {
      const session = this.auth.user();
      const sessionId = session?.id?.trim();
      if (sessionId && Number(sessionId) === userId) {
        const sessionName = session?.name?.trim();
        if (sessionName) return sessionName;
      }

      const match = users.find((u) => Number(u.id) === userId);
      if (match?.name?.trim()) return match.name.trim();
      if (match?.email?.trim()) return match.email.trim();

      return `User #${userId}`;
    }

    return current && current !== '—' ? current : '—';
  }

  private currentUserIdString(): string | undefined {
    const raw = this.auth.user()?.id?.trim();
    if (!raw || !/^\d+$/.test(raw)) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : undefined;
  }
}


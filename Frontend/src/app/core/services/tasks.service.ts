import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { TaskRow } from '../../features/tasks/tasks.component';
import { filterTasksForUser } from '../../features/user-dashboard/utils/user-ownership.util';
import { AuthService } from '../auth/auth.service';
import { AdminUsersService, type AdminUserRow } from './admin-users.service';
import { initialsFromDisplayName } from './leads/lead-owner-options.service';
import { LeadsService } from './leads.service';
import { DealsService } from './deals.service';
import { mergeTaskRowPatch } from './tasks/task-api.mapper';
import { TaskHttpService } from './tasks/task-http.service';
import { dealActivityDisplayName } from '../../shared/utils/activity-entity-display.util';
import {
  attachRelatedLeadName,
  buildLeadNameByIdMap,
  resolveTaskRelatedLeadId,
} from '../../shared/utils/lead-person-name.util';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly taskHttp = inject(TaskHttpService);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);

  getAll(): Observable<TaskRow[]> {
    return this.enrichRows(this.taskHttp.list());
  }

  getByRelatedLead(leadId: string | number): Observable<TaskRow[]> {
    const n = Number(leadId);
    if (!Number.isFinite(n) || n <= 0) return this.enrichRows(this.taskHttp.list());
    return this.enrichRows(this.taskHttp.list({ relatedLeadId: Math.trunc(n) }));
  }

  getByRelatedDeal(dealId: string | number): Observable<TaskRow[]> {
    const n = Number(dealId);
    if (!Number.isFinite(n) || n <= 0) return this.enrichRows(this.taskHttp.list());
    return this.enrichRows(this.taskHttp.list({ relatedDealId: Math.trunc(n) }));
  }

  /** Tasks where `assigneeUserId` = logged-in user. */
  getAssignedToUser(
    userId: string,
    userName = '',
    userEmail = '',
  ): Observable<TaskRow[]> {
    const numericId = Number(userId);
    const query =
      Number.isFinite(numericId) && numericId > 0
        ? { userId: Math.trunc(numericId) }
        : undefined;

    return this.enrichRows(
      this.taskHttp.list(query).pipe(catchError(() => this.taskHttp.list())),
    ).pipe(map((rows) => filterTasksForUser(rows, userId, userName, userEmail)));
  }

  getById(id: number): Observable<TaskRow | null> {
    return this.enrichRow(this.taskHttp.getById(id)).pipe(map((row) => row ?? null));
  }

  create(data: Omit<TaskRow, 'id'>): Observable<TaskRow> {
    return this.withUsers((users) =>
      this.taskHttp.create(data).pipe(map((row) => this.enrichTask(row, users))),
    );
  }

  update(id: number, data: Partial<Omit<TaskRow, 'id'>>): Observable<TaskRow | null> {
    return this.taskHttp.getById(id).pipe(
      switchMap((existing) => {
        if (!existing) return of(null);
        const merged = mergeTaskRowPatch(existing, data);
        return this.taskHttp.update(id, merged);
      }),
      switchMap((row) => (row != null ? this.enrichRow(of(row)) : of(null))),
      map((row) => row ?? null),
    );
  }

  delete(id: number): Observable<void> {
    return this.taskHttp.delete(id);
  }

  private enrichRows(source: Observable<TaskRow[]>): Observable<TaskRow[]> {
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
            map((rows) => rows.map((row) => this.enrichTaskRecord(row, users, leadNames, dealNames))),
          );
        }),
      ),
    );
  }

  private enrichRow(source: Observable<TaskRow | null>): Observable<TaskRow | null> {
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
            map((row) =>
              row != null ? this.enrichTaskRecord(row, users, leadNames, dealNames) : null,
            ),
          );
        }),
      ),
    );
  }

  private enrichTaskRecord(
    row: TaskRow,
    users: AdminUserRow[],
    leadNames: Map<string, string>,
    dealNames: Map<string, string>,
  ): TaskRow {
    let enriched = attachRelatedLeadName(
      this.enrichTask(row, users),
      resolveTaskRelatedLeadId(row),
      leadNames,
    );
    const dealId = row.relatedDealId?.trim();
    if (dealId) {
      const name = dealNames.get(dealId);
      if (name) enriched = { ...enriched, relatedDealName: name };
    }
    return enriched;
  }

  private withUsers<T>(project: (users: AdminUserRow[]) => Observable<T>): Observable<T> {
    return this.adminUsers.listUsers(this.auth.token()).pipe(
      catchError(() => of([] as AdminUserRow[])),
      switchMap((users) => project(users)),
    );
  }

  private enrichTask(row: TaskRow, users: AdminUserRow[]): TaskRow {
    const name = this.resolveAssigneeName(row, users);
    const initials = name ? initialsFromDisplayName(name) : row.assignedInitials;
    if (name === row.assignedTo && initials === row.assignedInitials) return row;
    return {
      ...row,
      assignedTo: name || row.assignedTo || '—',
      assignedInitials: initials || '?',
    };
  }

  private resolveAssigneeName(row: TaskRow, users: AdminUserRow[]): string {
    const current = row.assignedTo?.trim();
    if (current && current !== '—' && !current.startsWith('User #')) return current;

    const assigneeId = row.assignedToUserId ? Number(row.assignedToUserId) : null;
    if (assigneeId != null && Number.isFinite(assigneeId) && assigneeId > 0) {
      const session = this.auth.user();
      const sessionId = session?.id?.trim();
      if (sessionId && Number(sessionId) === assigneeId) {
        const sessionName = session?.name?.trim();
        if (sessionName) return sessionName;
      }

      const match = users.find((u) => Number(u.id) === assigneeId);
      if (match?.name?.trim()) return match.name.trim();
      if (match?.email?.trim()) return match.email.trim();

      return current?.startsWith('User #') ? current : `User #${assigneeId}`;
    }

    return current || '';
  }
}

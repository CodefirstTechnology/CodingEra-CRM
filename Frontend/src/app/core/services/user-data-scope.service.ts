import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { isAdmin } from '../auth/auth-role.util';
import { AuthService } from '../auth/auth.service';
import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';
import type { NoteRow } from '../../features/notes/notes.component';
import type { TaskRow } from '../../features/tasks/tasks.component';
import {
  filterDealsForUser,
  filterLeadsByLeadOwnerId,
  filterNotesForUser,
  filterTasksForUser,
} from '../../features/user-dashboard/utils/user-ownership.util';
import { DealsService } from './deals.service';
import { LeadsService } from './leads.service';
import { NotesService } from './notes.service';
import { TasksService } from './tasks.service';

/**
 * Returns list observables scoped to the logged-in user when `role_id` is User (1).
 * Admins (`role_id` 2) receive unfiltered lists.
 */
@Injectable({ providedIn: 'root' })
export class UserDataScopeService {
  private readonly auth = inject(AuthService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);

  isAdminSession(): boolean {
    return isAdmin(this.auth.user());
  }

  private sessionIds(): { userId: string; name: string; email: string } | null {
    const u = this.auth.user();
    if (!u?.id) return null;
    return { userId: u.id, name: u.name, email: u.email };
  }

  listLeads(): Observable<LeadRow[]> {
    const session = this.sessionIds();
    if (!session) return this.leadsService.getAll();
    if (this.isAdminSession()) return this.leadsService.getAll();
    return this.leadsService.getAssignedToUser(session.userId, session.name, session.email);
  }

  listDeals(): Observable<DealRow[]> {
    const session = this.sessionIds();
    if (!session) return this.dealsService.getAll();
    if (this.isAdminSession()) return this.dealsService.getAll();
    return this.dealsService.getAssignedToUser(session.userId, session.name, session.email);
  }

  listTasks(): Observable<TaskRow[]> {
    const session = this.sessionIds();
    if (!session) return this.tasksService.getAll();
    if (this.isAdminSession()) return this.tasksService.getAll();
    return this.tasksService.getAssignedToUser(session.userId, session.name, session.email);
  }

  listNotes(leadIds: ReadonlySet<string> = new Set(), dealIds: ReadonlySet<string> = new Set()): Observable<NoteRow[]> {
    const session = this.sessionIds();
    if (!session) return this.notesService.getAll();
    if (this.isAdminSession()) return this.notesService.getAll();
    return this.notesService.getAssignedToUser(
      session.userId,
      session.name,
      session.email,
      leadIds,
      dealIds,
    );
  }

  /** Client-side filter for merged lead lists (e.g. marketplace rows in local storage). */
  filterLeads(rows: LeadRow[]): LeadRow[] {
    const session = this.sessionIds();
    if (!session || this.isAdminSession()) return rows;
    return filterLeadsByLeadOwnerId(rows, session.userId);
  }

  filterDeals(rows: DealRow[]): DealRow[] {
    const session = this.sessionIds();
    if (!session || this.isAdminSession()) return rows;
    return filterDealsForUser(rows, session.userId, session.name, session.email);
  }

  filterTasks(rows: TaskRow[]): TaskRow[] {
    const session = this.sessionIds();
    if (!session || this.isAdminSession()) return rows;
    return filterTasksForUser(rows, session.userId, session.name, session.email);
  }

  filterNotes(
    rows: NoteRow[],
    leadIds: ReadonlySet<string> = new Set(),
    dealIds: ReadonlySet<string> = new Set(),
  ): NoteRow[] {
    const session = this.sessionIds();
    if (!session || this.isAdminSession()) return rows;
    return filterNotesForUser(rows, session.userId, session.name, session.email, leadIds, dealIds);
  }
}

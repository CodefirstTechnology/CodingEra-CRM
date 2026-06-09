import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { canViewAllQuotations, isAdmin } from '../auth/auth-role.util';
import { getModuleAccessScope } from '../auth/permission.util';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from './permission.service';
import type { ContactRow } from '../../features/contacts/contacts.component';
import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';
import type { NoteRow } from '../../features/notes/notes.component';
import type { TaskRow } from '../../features/tasks/tasks.component';
import {
  filterContactsByCreatedBy,
  filterDealsForUser,
  filterLeadsForUser,
  filterNotesForUser,
  filterTasksForUser,
} from '../../features/user-dashboard/utils/user-ownership.util';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { LeadsService } from './leads.service';
import { NotesService } from './notes.service';
import { TasksService } from './tasks.service';
import { QuotationsService } from './quotations.service';
import type { QuotationListItem } from './quotations/quotation-api.models';
import type { QuotationListQuery } from './quotations/quotation-http.service';

/**
 * Returns list observables scoped to the logged-in user when `role_id` is User (1).
 * Admins (`role_id` 2) receive unfiltered lists.
 */
@Injectable({ providedIn: 'root' })
export class UserDataScopeService {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly contactsService = inject(ContactsService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly quotationsService = inject(QuotationsService);

  /** True for Admin dashboard / assignment UI — not broad “any permission with All scope”. */
  isAdminSession(): boolean {
    const user = this.auth.user();
    if (!user) return false;
    return isAdmin(user) || this.permissions.canManageSettings();
  }

  /** Whether list endpoints for a module should skip owner scoping. */
  canViewUnscopedModule(module: string): boolean {
    if (this.isAdminSession()) return true;
    return this.moduleScope(module) === 'all';
  }

  moduleScope(module: string): 'own' | 'team' | 'all' {
    return getModuleAccessScope(this.auth.user(), module);
  }

  canViewAllQuotations(): boolean {
    return canViewAllQuotations(this.auth.user());
  }

  private sessionIds(): { userId: string; name: string; email: string } | null {
    const u = this.auth.user();
    if (!u?.id) return null;
    return { userId: u.id, name: u.name, email: u.email };
  }

  listContacts(): Observable<ContactRow[]> {
    return this.contactsService.getAll().pipe(map((rows) => this.filterContacts(rows)));
  }

  listLeads(): Observable<LeadRow[]> {
    const session = this.sessionIds();
    if (!session) return this.leadsService.getAll();
    if (this.canViewUnscopedModule('leads')) return this.leadsService.getAll();
    return this.leadsService.getAssignedToUser(session.userId, session.name, session.email);
  }

  listDeals(): Observable<DealRow[]> {
    const session = this.sessionIds();
    if (!session) return this.dealsService.getAll();
    if (this.canViewUnscopedModule('deals')) return this.dealsService.getAll();
    return this.dealsService.getAssignedToUser(session.userId, session.name, session.email);
  }

  listTasks(): Observable<TaskRow[]> {
    const session = this.sessionIds();
    if (!session) return this.tasksService.getAll();
    if (this.canViewUnscopedModule('tasks')) return this.tasksService.getAll();
    return this.tasksService.getAssignedToUser(session.userId, session.name, session.email);
  }

  /**
   * Quotations list — scoped on the API by `created_by` for standard users.
   * Applies an extra client filter when `createdBy` is present on rows.
   */
  listQuotations(query?: QuotationListQuery): Observable<QuotationListItem[]> {
    return this.quotationsService.list(query).pipe(
      map((rows) => this.filterQuotations(rows)),
    );
  }

  filterQuotations(rows: QuotationListItem[]): QuotationListItem[] {
    if (this.canViewAllQuotations()) return rows;
    const session = this.sessionIds();
    if (!session) return rows;
    const uid = Number(session.userId);
    if (!Number.isFinite(uid) || uid <= 0) return rows;
    return rows.filter((r) => r.createdBy == null || r.createdBy === uid);
  }

  listNotes(leadIds: ReadonlySet<string> = new Set(), dealIds: ReadonlySet<string> = new Set()): Observable<NoteRow[]> {
    const session = this.sessionIds();
    if (!session) return this.notesService.getAll();
    if (this.canViewUnscopedModule('notes')) return this.notesService.getAll();
    return this.notesService.getAssignedToUser(
      session.userId,
      session.name,
      session.email,
      leadIds,
      dealIds,
    );
  }

  /** Client-side filter for merged lead lists (e.g. marketplace rows in local storage). */
  filterContacts(rows: ContactRow[]): ContactRow[] {
    if (this.canViewUnscopedModule('contacts')) return rows;
    const session = this.sessionIds();
    if (!session) return rows;
    const scope = this.moduleScope('contacts');
    if (scope === 'all') return rows;
    if (scope === 'own') return filterContactsByCreatedBy(rows, session.userId);
    return rows;
  }

  filterLeads(rows: LeadRow[]): LeadRow[] {
    const session = this.sessionIds();
    if (!session || this.canViewUnscopedModule('leads')) return rows;
    return filterLeadsForUser(rows, session.userId, session.name, session.email);
  }

  filterDeals(rows: DealRow[]): DealRow[] {
    const session = this.sessionIds();
    if (!session || this.canViewUnscopedModule('deals')) return rows;
    return filterDealsForUser(rows, session.userId, session.name, session.email);
  }

  filterTasks(rows: TaskRow[]): TaskRow[] {
    const session = this.sessionIds();
    if (!session || this.canViewUnscopedModule('tasks')) return rows;
    return filterTasksForUser(rows, session.userId, session.name, session.email);
  }

  filterNotes(
    rows: NoteRow[],
    leadIds: ReadonlySet<string> = new Set(),
    dealIds: ReadonlySet<string> = new Set(),
  ): NoteRow[] {
    const session = this.sessionIds();
    if (!session || this.canViewUnscopedModule('notes')) return rows;
    return filterNotesForUser(rows, session.userId, session.name, session.email, leadIds, dealIds);
  }
}

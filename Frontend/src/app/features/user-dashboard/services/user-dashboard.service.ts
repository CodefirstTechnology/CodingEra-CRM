import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { DealsService } from '../../../core/services/deals.service';
import { LeadOwnerOptionsService } from '../../../core/services/leads/lead-owner-options.service';
import { LeadsService, leadsHttpErrorMessage } from '../../../core/services/leads.service';
import { NotesService } from '../../../core/services/notes.service';
import { TasksService } from '../../../core/services/tasks.service';
import type { DealRow } from '../../deals/deals.component';
import type { LeadRow } from '../../leads/lead-row.model';
import type { NoteRow } from '../../notes/notes.component';
import type { TaskRow } from '../../tasks/tasks.component';
import type {
  UserDashboardActivityItem,
  UserDashboardFollowUpItem,
  UserDashboardKpis,
  UserDashboardLeadStatusSummary,
  UserDashboardLeadTableRow,
  UserDashboardPerformance,
  UserDashboardSnapshot,
} from '../models/user-dashboard.models';
import {
  isDealOwnedByUser,
  isLeadOwnedByUser,
  isNoteByUser,
  isTaskAssignedToUser,
} from '../utils/user-ownership.util';

@Injectable({ providedIn: 'root' })
export class UserDashboardService {
  private readonly auth = inject(AuthService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);

  loadSnapshot(): Observable<{ data: UserDashboardSnapshot | null; error: string | null }> {
    const user = this.auth.user();
    if (!user?.id) {
      return of({ data: null, error: 'No active session.' });
    }

    return forkJoin({
      owners: this.leadOwnerOpts.ensureLoaded(),
      leads: this.leadsService.getAll().pipe(catchError((e) => of([] as LeadRow[]))),
      deals: this.dealsService.getAll().pipe(catchError(() => of([] as DealRow[]))),
      tasks: this.tasksService.getAll().pipe(catchError(() => of([] as TaskRow[]))),
      notes: this.notesService.getAll().pipe(catchError(() => of([] as NoteRow[]))),
    }).pipe(
      map(({ leads, deals, tasks, notes }) => {
        const enriched = this.leadOwnerOpts.enrichRows(leads);
        const userId = user.id;
        const userName = user.name;
        const userEmail = user.email;

        const myLeads = enriched.filter((l) => isLeadOwnedByUser(l, userId, userName, userEmail));
        const myDeals = deals.filter((d) => isDealOwnedByUser(d, userId, userName, userEmail));
        const myTasks = tasks.filter((t) => isTaskAssignedToUser(t, userId, userName, userEmail));
        const myNotes = notes.filter((n) => isNoteByUser(n, userName, userEmail));

        const taskDueByLead = this.buildLeadNextFollowUpMap(myTasks);
        const tableRows = myLeads.map((l) => this.toLeadTableRow(l, taskDueByLead.get(l.id)));

        return {
          data: this.buildSnapshot(tableRows, myLeads, myDeals, myTasks, myNotes),
          error: null as string | null,
        };
      }),
      catchError((err: unknown) =>
        of({ data: null, error: leadsHttpErrorMessage(err) }),
      ),
    );
  }

  private buildSnapshot(
    tableRows: UserDashboardLeadTableRow[],
    myLeads: LeadRow[],
    myDeals: DealRow[],
    myTasks: TaskRow[],
    myNotes: NoteRow[],
  ): UserDashboardSnapshot {
    const today = this.startOfDay(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const todaysLeads = myLeads.filter((l) => {
      const t = this.parseDate(l.sortTimestamp ? new Date(l.sortTimestamp) : l.updated);
      return t && t >= today;
    });

    const activeDeals = myDeals.filter(
      (d) => d.status !== 'Closed Won' && d.status !== 'Closed Lost',
    );
    const closedDeals = myDeals.filter((d) => d.status === 'Closed Won');
    const monthlyClosed = closedDeals.filter((d) => {
      const t = this.parseDate(d.lastModified);
      return t && t >= monthStart;
    });

    const pendingTasks = myTasks.filter((t) => t.status !== 'Done' && t.status !== 'Canceled');
    const completedTasks = myTasks.filter((t) => t.status === 'Done');
    const followUpsToday = this.buildFollowUps(myTasks, today);

    const monthlyRevenue = closedDeals.reduce((sum, d) => {
      const t = this.parseDate(d.lastModified);
      if (!t || t < monthStart) return sum;
      return sum + (Number.isFinite(d.annualRevenue) ? d.annualRevenue : 0);
    }, 0);

    const converted = myLeads.filter((l) => l.status === 'Converted').length;
    const conversionPct = myLeads.length ? Math.round((converted / myLeads.length) * 1000) / 10 : 0;
    const monthlyClosureRate = myLeads.length
      ? Math.round((monthlyClosed.length / myLeads.length) * 1000) / 10
      : 0;

    const targetProgressPct = Math.min(100, Math.round((monthlyClosed.length / 10) * 100));

    return {
      kpis: {
        myLeads: myLeads.length,
        activeDeals: activeDeals.length,
        followUpsToday: followUpsToday.filter((f) => f.kind !== 'meeting').length,
        tasksPending: pendingTasks.length,
        meetingsToday: followUpsToday.filter((f) => f.kind === 'meeting').length,
        monthlyRevenue,
      } satisfies UserDashboardKpis,
      assignedLeads: tableRows.slice(0, 25),
      todaysLeads: todaysLeads
        .slice(0, 8)
        .map((l) => this.toLeadTableRow(l, undefined)),
      followUps: followUpsToday,
      activities: this.buildActivities(myLeads, myTasks, myNotes, myDeals).slice(0, 12),
      performance: {
        conversionPct,
        monthlyClosureRate,
        completedTasks: completedTasks.length,
        targetProgressPct,
        closedDeals: closedDeals.length,
        pendingCalls: pendingTasks.filter((t) => /call/i.test(t.title)).length,
      } satisfies UserDashboardPerformance,
      statusSummary: this.buildStatusSummary(myLeads),
    };
  }

  private buildStatusSummary(leads: LeadRow[]): UserDashboardLeadStatusSummary[] {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const key = l.status || 'New';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = leads.length || 1;
    return [...counts.entries()]
      .map(([status, count]) => ({
        status,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }

  private buildFollowUps(tasks: TaskRow[], today: Date): UserDashboardFollowUpItem[] {
    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);
    const items: UserDashboardFollowUpItem[] = [];

    for (const t of tasks) {
      if (t.status === 'Done' || t.status === 'Canceled') continue;
      const due = this.parseDate(t.dueDateRaw || t.dueDate);
      if (!due) continue;

      const isMeeting = /meeting|review|demo/i.test(t.title);
      const kind: UserDashboardFollowUpItem['kind'] =
        due < today ? 'overdue' : due <= endToday && isMeeting ? 'meeting' : due <= endToday ? 'upcoming' : 'upcoming';

      if (due > endToday && !isMeeting) continue;
      if (due > endToday && isMeeting) continue;

      items.push({
        id: t.id,
        title: t.title,
        dueLabel: this.formatDueLabel(due, today),
        kind: due < today ? 'overdue' : isMeeting ? 'meeting' : 'upcoming',
      });
    }

    return items
      .sort((a, b) => {
        const order = { overdue: 0, upcoming: 1, meeting: 2 };
        return order[a.kind] - order[b.kind];
      })
      .slice(0, 10);
  }

  private buildActivities(
    leads: LeadRow[],
    tasks: TaskRow[],
    notes: NoteRow[],
    deals: DealRow[],
  ): UserDashboardActivityItem[] {
    const items: UserDashboardActivityItem[] = [];

    for (const l of leads) {
      items.push({
        id: `lead-${l.id}`,
        type: 'status',
        title: `Lead · ${l.status}`,
        subtitle: `${this.leadDisplayName(l)} · ${l.organization || '—'}`,
        timeLabel: l.updated || '—',
      });
    }

    for (const t of tasks.slice(0, 20)) {
      const type = /call/i.test(t.title) ? 'call' : /meeting/i.test(t.title) ? 'meeting' : 'task';
      items.push({
        id: `task-${t.id}`,
        type,
        title: t.title,
        subtitle: `${t.status} · ${t.priority} priority`,
        timeLabel: t.lastModified || t.dueDate,
      });
    }

    for (const n of notes.slice(0, 15)) {
      items.push({
        id: `note-${n.id}`,
        type: 'note',
        title: n.title,
        subtitle: `${n.relatedType} · ${n.relatedName}`,
        timeLabel: n.when,
      });
    }

    for (const d of deals.slice(0, 10)) {
      items.push({
        id: `deal-${d.id}`,
        type: 'status',
        title: `Deal · ${d.status}`,
        subtitle: d.organizationName,
        timeLabel: d.lastModified,
      });
    }

    return items.sort((a, b) => (a.timeLabel < b.timeLabel ? 1 : -1));
  }

  private buildLeadNextFollowUpMap(tasks: TaskRow[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (!t.relatedLeadId || t.status === 'Done' || t.status === 'Canceled') continue;
      const due = t.dueDateRaw || t.dueDate;
      const prev = map.get(t.relatedLeadId);
      if (!prev || due < prev) map.set(t.relatedLeadId, due);
    }
    return map;
  }

  private toLeadTableRow(lead: LeadRow, nextFollowUp?: string): UserDashboardLeadTableRow {
    return {
      id: lead.id,
      leadName: this.leadDisplayName(lead),
      company: lead.organization || '—',
      status: lead.status,
      priority: this.leadPriorityLabel(lead),
      assignedDate: lead.updated || '—',
      nextFollowUp: nextFollowUp?.trim() ? this.formatShortDate(nextFollowUp) : '—',
      source: lead.source?.trim() || lead.leadSource || 'Manual',
    };
  }

  private leadDisplayName(lead: LeadRow): string {
    const full = lead.name?.trim();
    if (full) return full;
    const parts = [lead.firstName, lead.lastName].map((p) => p?.trim()).filter(Boolean);
    return parts.length ? parts.join(' ') : 'Unnamed lead';
  }

  private leadPriorityLabel(lead: LeadRow): string {
    switch (lead.status) {
      case 'Qualified':
      case 'Converted':
        return 'High';
      case 'Contacted':
        return 'Medium';
      case 'Lost':
        return 'Low';
      default:
        return lead.requestType?.trim() ? lead.requestType : 'Normal';
    }
  }

  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private parseDate(raw: string | Date | number | undefined | null): Date | null {
    if (raw == null) return null;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'number') {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const t = Date.parse(String(raw).trim());
    if (Number.isNaN(t)) return null;
    return new Date(t);
  }

  private formatShortDate(raw: string): string {
    const d = this.parseDate(raw);
    if (!d) return raw;
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  }

  private formatDueLabel(due: Date, today: Date): string {
    const start = this.startOfDay(today).getTime();
    const d0 = this.startOfDay(due).getTime();
    if (d0 < start) return 'Overdue';
    if (d0 === start) return 'Today';
    return this.formatShortDate(due.toISOString());
  }
}

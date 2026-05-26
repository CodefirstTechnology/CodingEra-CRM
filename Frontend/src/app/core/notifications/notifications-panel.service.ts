import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { ActivityRow } from '../services/activities/activity-api.models';
import { formatActivityWhen } from '../services/activities/activity-api.mapper';
import { ActivitiesService } from '../services/activities.service';
import { AuthService } from '../auth/auth.service';
import { UserDataScopeService } from '../services/user-data-scope.service';
import type { TaskRow } from '../../features/tasks/tasks.component';
import {
  activityEntityDisplayLabel,
  buildActivityEntityNameMap,
} from '../../shared/utils/activity-entity-display.util';

export type NotificationCategory = 'deal' | 'task' | 'message' | 'system';

export interface CrmNotification {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  category: NotificationCategory;
  read: boolean;
  sortAt: number;
}

const READ_IDS_KEY = 'crm-notification-read-ids';
const NOTIFICATION_LIMIT = 25;

@Injectable({ providedIn: 'root' })
export class NotificationsPanelService {
  private readonly auth = inject(AuthService);
  private readonly scope = inject(UserDataScopeService);
  private readonly activitiesService = inject(ActivitiesService);

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly items = signal<CrmNotification[]>([]);
  private readonly readIds = signal<Set<string>>(loadReadIds());
  private lastUserId: string | null = null;
  private refreshToken = 0;

  readonly notifications = this.items.asReadonly();

  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id?.trim() ?? null;
      if (userId === this.lastUserId) return;
      this.lastUserId = userId;
      if (userId) {
        this.refresh();
      } else {
        this.items.set([]);
        this.loading.set(false);
        this.error.set(null);
      }
    });
  }

  toggle(): void {
    const willOpen = !this.open();
    this.open.set(willOpen);
    if (willOpen) this.refresh();
  }

  close(): void {
    this.open.set(false);
  }

  markRead(id: string): void {
    this.readIds.update((set) => {
      const next = new Set(set);
      next.add(id);
      saveReadIds(next);
      return next;
    });
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  markAllRead(): void {
    const ids = this.items().map((n) => n.id);
    this.readIds.update((set) => {
      const next = new Set(set);
      for (const id of ids) next.add(id);
      saveReadIds(next);
      return next;
    });
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  refresh(): void {
    const user = this.auth.user();
    if (!user?.id?.trim()) {
      this.items.set([]);
      return;
    }

    const token = ++this.refreshToken;
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      leads: this.scope.listLeads().pipe(catchError(() => of([]))),
      deals: this.scope.listDeals().pipe(catchError(() => of([]))),
      tasks: this.scope.listTasks().pipe(catchError(() => of([] as TaskRow[]))),
    })
      .pipe(
        switchMap(({ leads, deals, tasks }) => {
          const leadIds = leads
            .map((l) => Number(l.id))
            .filter((n) => Number.isFinite(n) && n > 0);
          const dealIds = deals
            .map((d) => Number(d.id))
            .filter((n) => Number.isFinite(n) && n > 0);
          const entityNames = buildActivityEntityNameMap(leads, deals);

          return this.activitiesService.getRecentForRecords(leadIds, dealIds, NOTIFICATION_LIMIT).pipe(
            catchError(() => of([] as ActivityRow[])),
            map((activities) => ({
              activities,
              entityNames,
              tasks,
            })),
          );
        }),
      )
      .subscribe({
        next: ({ activities, entityNames, tasks }) => {
          if (token !== this.refreshToken) return;
          const readSet = this.readIds();
          const rows = [
            ...activities.map((row) => this.fromActivity(row, entityNames, readSet)),
            ...this.fromDueTasks(tasks, readSet),
          ]
            .sort((a, b) => b.sortAt - a.sortAt)
            .slice(0, NOTIFICATION_LIMIT);

          this.items.set(rows);
          this.loading.set(false);
        },
        error: () => {
          if (token !== this.refreshToken) return;
          this.items.set([]);
          this.loading.set(false);
          this.error.set('Could not load notifications.');
        },
      });
  }

  private fromActivity(
    row: ActivityRow,
    entityNames: Map<string, string>,
    readSet: Set<string>,
  ): CrmNotification {
    const id = `activity-${row.id}`;
    const entityLabel = activityEntityDisplayLabel(row.entityType, row.entityId, entityNames);
    const body =
      row.fieldName && (row.oldValue != null || row.newValue != null)
        ? `${entityLabel} · ${row.fieldName}: ${row.oldValue ?? '—'} → ${row.newValue ?? '—'}`
        : `${entityLabel} · ${row.actorName}`;

    return {
      id,
      title: row.message,
      body,
      timeLabel: row.whenLabel,
      category: this.categoryFromActivity(row),
      read: readSet.has(id),
      sortAt: Date.parse(row.createdAt) || 0,
    };
  }

  private fromDueTasks(tasks: TaskRow[], readSet: Set<string>): CrmNotification[] {
    const today = startOfDay(new Date());
    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);
    const items: CrmNotification[] = [];

    for (const task of tasks) {
      if (task.status === 'Done' || task.status === 'Canceled') continue;
      const due = parseDate(task.dueDateRaw || task.dueDate);
      if (!due || due > endToday) continue;

      const id = `task-${task.id}`;
      const overdue = due < today;
      items.push({
        id,
        title: overdue ? 'Task overdue' : 'Task due today',
        body: task.title.trim() || 'Untitled task',
        timeLabel: formatActivityWhen(due.toISOString()),
        category: 'task',
        read: readSet.has(id),
        sortAt: due.getTime(),
      });
    }

    return items;
  }

  private categoryFromActivity(row: ActivityRow): NotificationCategory {
    const action = row.actionType.toLowerCase();
    const entity = String(row.entityType).toLowerCase();

    if (entity === 'deal') return 'deal';
    if (action.includes('task')) return 'task';
    if (
      action.includes('comment') ||
      action.includes('note') ||
      action.includes('email') ||
      action.includes('message')
    ) {
      return 'message';
    }
    if (entity === 'lead' && (action.includes('stage') || action.includes('status'))) return 'deal';
    return 'system';
  }
}

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota errors */
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(raw: string | undefined | null): Date | null {
  if (raw == null || !String(raw).trim()) return null;
  const t = Date.parse(String(raw).trim());
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

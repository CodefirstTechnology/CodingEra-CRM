import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { AuthService } from '../../core/auth/auth.service';
import { LeadOwnerOptionsService } from '../../core/services/leads/lead-owner-options.service';
import { TasksService } from '../../core/services/tasks.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { createIdSelection } from '../../shared/utils/selection-manager';

export type TaskStatus = 'Backlog' | 'Todo' | 'In Progress' | 'Done' | 'Canceled';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface AssigneeOption {
  id: string;
  label: string;
  initials: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  dueDateRaw: string;
  assignedTo: string;
  /** Backend `assignedToUserId` when returned by API. */
  assignedToUserId?: string;
  assignedInitials: string;
  lastModified: string;
  /** When created from lead detail — used to scope tasks on the lead. */
  relatedLeadId?: string;
  /** When created from deal detail — used to scope tasks on the deal. */
  relatedDealId?: string;
}

@Component({
  selector: 'app-tasks',
  imports: [ReactiveFormsModule, CrmSelectionBarComponent],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss',
})
export class TasksComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  private localDatetimeInputValue(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  protected readonly formOpen = signal(false);

  protected readonly taskStatusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'Backlog', label: '◌ Backlog' },
    { value: 'Todo', label: '○ Todo' },
    { value: 'In Progress', label: '◐ In Progress' },
    { value: 'Done', label: '✓ Done' },
    { value: 'Canceled', label: '✕ Canceled' },
  ];

  protected readonly priorityOptions: { value: TaskPriority; label: string }[] = [
    { value: 'Low', label: '● Low' },
    { value: 'Medium', label: '● Medium' },
    { value: 'High', label: '● High' },
  ];

  protected readonly assigneeOptions = this.leadOwnerOpts.options;

  protected readonly rows = signal<TaskRow[]>([]);

  constructor() {
    this.leadOwnerOpts.load();
    this.refreshTasks();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'task') return;
      this.refreshTasks();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshTasks(): void {
    this.userScope
      .listTasks()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
  );

  protected readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(2000)],
    status: this.fb.nonNullable.control<TaskStatus>('Backlog', Validators.required),
    assignee: ['', Validators.required],
    dueDate: ['', Validators.required],
    priority: this.fb.nonNullable.control<TaskPriority>('Low', Validators.required),
  });

  private clearEditQuery(): void {
    this.lastRouteEdit = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
    });
  }

  protected isRowSelected(id: string): boolean {
    return this.sel.isSelected(id);
  }

  protected toggleRow(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.sel.toggle(id);
  }

  protected toggleSelectAll(): void {
    this.sel.toggleSelectAll(this.rows().map((r) => r.id));
  }

  private defaultAssigneeId(): string {
    const sessionId = this.auth.user()?.id?.trim();
    if (sessionId && this.leadOwnerOpts.findById(sessionId)) return sessionId;
    return this.leadOwnerOpts.options()[0]?.id ?? '';
  }

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.createForm.reset({
      title: '',
      description: '',
      status: 'Backlog',
      assignee: this.defaultAssigneeId(),
      dueDate: this.localDatetimeInputValue(),
      priority: 'Low',
    });
    this.createForm.markAsUntouched();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.createForm.reset({
      title: '',
      description: '',
      status: 'Backlog',
      assignee: this.defaultAssigneeId(),
      dueDate: this.localDatetimeInputValue(),
      priority: 'Low',
    });
    this.createForm.markAsUntouched();
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.tasksService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        const person =
          this.leadOwnerOpts.findById(row.assignedToUserId) ??
          this.assigneeOptions().find(
            (a) => a.initials === row.assignedInitials || a.label === row.assignedTo,
          );
        this.createForm.patchValue({
          title: row.title,
          description: row.description ?? '',
          status: row.status,
          assignee: person?.id ?? row.assignedToUserId ?? this.defaultAssigneeId(),
          dueDate: row.dueDateRaw?.trim() || this.localDatetimeInputValue(),
          priority: row.priority,
        });
        this.formOpen.set(true);
      });
  }

  protected openTaskForEdit(row: TaskRow, ev?: Event): void {
    ev?.stopPropagation();
    const idStr = row.id?.trim();
    if (!idStr) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: idStr },
      queryParamsHandling: 'merge',
    });
    this.beginEditFromRoute(idStr);
  }

  protected onBulkEdit(): void {
    const ids = this.sel.selectedItems();
    if (ids.length !== 1) return;
    const row = this.rows().find((r) => r.id === ids[0]);
    if (row) this.openTaskForEdit(row);
  }

  protected onBulkDelete(): void {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    forkJoin(ids.map((sid) => this.tasksService.delete(Number(sid)).pipe(take(1)))).subscribe({
      next: () => {
        this.sel.clear();
        this.refreshTasks();
        const n = ids.length;
        this.toast.success(n === 1 ? 'Task deleted.' : `${n} tasks deleted.`);
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected formatDueDisplay(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  protected submitTask(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const person =
      this.leadOwnerOpts.findById(raw.assignee) ??
      this.assigneeOptions().find((a) => a.id === raw.assignee);
    const dueRaw = raw.dueDate.trim();
    const dueDisplay = dueRaw ? this.formatDueDisplay(dueRaw) : '—';
    const assigneeUserId = person?.id?.trim();

    const payload: Omit<TaskRow, 'id'> = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      status: raw.status,
      priority: raw.priority,
      dueDate: dueDisplay,
      dueDateRaw: dueRaw,
      assignedTo: person?.label ?? raw.assignee,
      assignedInitials: person?.initials ?? '?',
      assignedToUserId:
        assigneeUserId && /^\d+$/.test(assigneeUserId) ? assigneeUserId : undefined,
      lastModified: 'Just now',
    };

    const editId = this.editingNumericId();
    const done = () => {
      this.sel.clear();
      this.refreshTasks();
      this.closeForm();
    };

    if (editId != null) {
      this.tasksService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Task updated.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    } else {
      this.tasksService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Task created.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    }
  }

  protected deleteTask(row: TaskRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.tasksService
      .delete(id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.sel.removeId(row.id);
          this.refreshTasks();
          this.toast.success('Task deleted.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected statusClass(status: TaskStatus): string {
    switch (status) {
      case 'Done':
        return 'tasks__tag tasks__tag--done';
      case 'Canceled':
        return 'tasks__tag tasks__tag--canceled';
      case 'In Progress':
        return 'tasks__tag tasks__tag--progress';
      case 'Todo':
        return 'tasks__tag tasks__tag--todo';
      default:
        return 'tasks__tag tasks__tag--backlog';
    }
  }

  protected priorityClass(p: TaskPriority): string {
    switch (p) {
      case 'High':
        return 'tasks__pri tasks__pri--high';
      case 'Medium':
        return 'tasks__pri tasks__pri--med';
      default:
        return 'tasks__pri tasks__pri--low';
    }
  }
}

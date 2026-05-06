import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { TasksService } from '../../core/services/tasks.service';

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
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  dueDateRaw: string;
  assignedTo: string;
  assignedInitials: string;
  lastModified: string;
}

@Component({
  selector: 'app-tasks',
  imports: [ReactiveFormsModule],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss',
})
export class TasksComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly tasksService = inject(TasksService);

  private localDatetimeInputValue(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  protected readonly formOpen = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());

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

  protected readonly assigneeOptions: AssigneeOption[] = [
    { id: 'RD', label: 'Rohit Dhaygude', initials: 'R' },
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly rows = signal<TaskRow[]>([]);

  constructor() {
    this.refreshTasks();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'task') return;
      this.refreshTasks();
    });
  }

  private refreshTasks(): void {
    this.tasksService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() => {
    const ids = this.rows().map((r) => r.id);
    if (ids.length === 0) return false;
    const sel = this.selectedIds();
    return ids.every((id) => sel.has(id));
  });

  protected readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(2000)],
    status: this.fb.nonNullable.control<TaskStatus>('Backlog', Validators.required),
    assignee: ['RD', Validators.required],
    dueDate: [''],
    priority: this.fb.nonNullable.control<TaskPriority>('Low', Validators.required),
  });

  protected isRowSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected toggleRow(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.selectedIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleSelectAll(): void {
    const ids = this.rows().map((r) => r.id);
    this.selectedIds.update((prev) => {
      if (ids.length && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }

  protected openForm(): void {
    this.createForm.reset({
      title: '',
      description: '',
      status: 'Backlog',
      assignee: 'RD',
      dueDate: this.localDatetimeInputValue(),
      priority: 'Low',
    });
    this.createForm.markAsUntouched();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.createForm.reset({
      title: '',
      description: '',
      status: 'Backlog',
      assignee: 'RD',
      dueDate: this.localDatetimeInputValue(),
      priority: 'Low',
    });
    this.createForm.markAsUntouched();
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
    const person = this.assigneeOptions.find((a) => a.id === raw.assignee);
    const dueRaw = raw.dueDate.trim();
    const dueDisplay = dueRaw ? this.formatDueDisplay(dueRaw) : '—';

    const payload: Omit<TaskRow, 'id'> = {
      title: raw.title.trim(),
      status: raw.status,
      priority: raw.priority,
      dueDate: dueDisplay,
      dueDateRaw: dueRaw,
      assignedTo: person?.label ?? raw.assignee,
      assignedInitials: person?.initials ?? '?',
      lastModified: 'Just now',
    };

    this.tasksService
      .create(payload)
      .pipe(take(1))
      .subscribe(() => {
        this.refreshTasks();
        this.closeForm();
      });
  }

  protected deleteTask(row: TaskRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.tasksService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.selectedIds.update((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        this.refreshTasks();
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

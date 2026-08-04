import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { canManageSettings } from '../../../core/auth/permission.util';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionService } from '../../../core/services/permission.service';
import type {
  UserTargetRow,
  UserTargetSalesUser,
  UserTargetType,
} from '../../../core/services/user-targets/user-target-api.models';
import { UserTargetHttpService } from '../../../core/services/user-targets/user-target-http.service';
import { ToastService } from '../../../core/toast/toast.service';

type Tab = 'manage' | 'monitor';
type ViewMode = 'list' | 'create' | 'edit';

@Component({
  selector: 'app-user-target-settings',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './user-target-settings.component.html',
  styleUrl: './user-target-settings.component.scss',
})
export class UserTargetSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(UserTargetHttpService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);

  /** Skip auto date range while patching the form (create/edit open). */
  private skipTargetDateAuto = false;

  protected readonly canManage = computed(
    () =>
      canManageSettings(this.auth.user()) ||
      this.permissions.hasAny(['user_targets.manage', 'settings.manage']),
  );

  protected readonly activeTab = signal<Tab>('manage');
  protected readonly viewMode = signal<ViewMode>('list');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly targetTypes = signal<UserTargetType[]>([]);
  protected readonly salesUsers = signal<UserTargetSalesUser[]>([]);
  protected readonly targets = signal<UserTargetRow[]>([]);
  protected readonly monitorRows = signal<UserTargetRow[]>([]);
  protected readonly editingId = signal<number | null>(null);

  protected readonly searchQuery = signal('');
  protected readonly userFilter = signal<number | ''>('');
  protected readonly typeFilter = signal<number | ''>('');
  protected readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  protected readonly sortBy = signal<
    'userName' | 'targetTypeName' | 'targetAmount' | 'achievedAmount' | 'achievementPercent' | 'isActive'
  >('userName');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');

  protected readonly targetForm = this.fb.nonNullable.group({
    userId: [0, [Validators.required, Validators.min(1)]],
    targetTypeId: [0, [Validators.required, Validators.min(1)]],
    targetAmount: [0, [Validators.required, Validators.min(0)]],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    isActive: [true],
  });

  protected readonly filteredManageRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    let rows = this.targets();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q) ||
          r.targetTypeName.toLowerCase().includes(q),
      );
    }
    return rows;
  });

  ngOnInit(): void {
    this.targetForm.controls.targetTypeId.valueChanges.subscribe(() => {
      if (this.skipTargetDateAuto) return;
      if (this.viewMode() === 'list') return;
      this.applyDatesForSelectedType();
    });
    this.loadMeta();
    this.loadManageList();
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.viewMode.set('list');
    if (tab === 'monitor') {
      this.loadMonitor();
    } else {
      this.loadManageList();
    }
  }

  protected loadMeta(): void {
    this.api.listTypes().subscribe({
      next: (rows) => this.targetTypes.set(rows),
      error: () => {},
    });
    if (this.canManage()) {
      this.api.listSalesUsers().subscribe({
        next: (rows) => this.salesUsers.set(rows),
        error: () => {},
      });
    }
  }

  protected loadManageList(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.listTargets(true).subscribe({
      next: (rows) => {
        this.targets.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load targets.');
      },
    });
  }

  protected loadMonitor(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const status = this.statusFilter();
    this.api
      .listMonitor({
        search: this.searchQuery(),
        userId: this.userFilter() || undefined,
        targetTypeId: this.typeFilter() || undefined,
        isActive: status === 'all' ? undefined : status === 'active',
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
      })
      .subscribe({
        next: (rows) => {
          this.monitorRows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('Could not load monitoring data.');
        },
      });
  }

  protected openCreate(): void {
    if (!this.canManage()) return;
    this.editingId.set(null);
    const today = this.formatLocalDate(new Date());
    const defaultTypeId = this.preferCustomTargetTypeId() || this.targetTypes()[0]?.id || 0;
    this.skipTargetDateAuto = true;
    this.targetForm.reset({
      userId: 0,
      targetTypeId: defaultTypeId,
      targetAmount: 0,
      startDate: today,
      endDate: today,
      isActive: true,
    });
    this.skipTargetDateAuto = false;
    this.applyDatesForSelectedType();
    this.viewMode.set('create');
  }

  protected openEdit(row: UserTargetRow): void {
    if (!this.canManage()) return;
    this.editingId.set(row.id);
    this.skipTargetDateAuto = true;
    this.targetForm.patchValue({
      userId: row.userId,
      targetTypeId: row.targetTypeId,
      targetAmount: row.targetAmount,
      startDate: row.startDate.slice(0, 10),
      endDate: row.endDate.slice(0, 10),
      isActive: row.isActive,
    });
    this.skipTargetDateAuto = false;
    this.viewMode.set('edit');
  }

  protected cancelForm(): void {
    this.viewMode.set('list');
    this.editingId.set(null);
  }

  protected submitForm(): void {
    if (!this.canManage()) return;
    this.targetForm.markAllAsTouched();
    if (this.targetForm.invalid) return;

    const v = this.targetForm.getRawValue();
    if (v.endDate < v.startDate) {
      this.toast.error('End date must be on or after start date.');
      return;
    }

    this.saving.set(true);
    const payload = {
      userId: Number(v.userId),
      targetTypeId: Number(v.targetTypeId),
      targetAmount: Number(v.targetAmount),
      startDate: v.startDate,
      endDate: v.endDate,
      isActive: v.isActive,
    };

    const id = this.editingId();
    const req = id ? this.api.update(id, payload) : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(id ? 'Target updated.' : 'Target created.');
        this.viewMode.set('list');
        this.loadManageList();
        if (this.activeTab() === 'monitor') this.loadMonitor();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const msg =
          (err as { error?: { message?: string } })?.error?.message ??
          'Could not save target.';
        this.toast.error(msg);
      },
    });
  }

  protected toggleStatus(row: UserTargetRow): void {
    if (!this.canManage()) return;
    this.api.setActive(row.id, !row.isActive).subscribe({
      next: () => {
        this.toast.success(row.isActive ? 'Target deactivated.' : 'Target activated.');
        this.loadManageList();
        if (this.activeTab() === 'monitor') this.loadMonitor();
      },
      error: () => this.toast.error('Could not update target status.'),
    });
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
    if (this.activeTab() === 'monitor') this.loadMonitor();
  }

  protected onUserFilter(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.userFilter.set(v ? Number(v) : '');
    this.loadMonitor();
  }

  protected onTypeFilter(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.typeFilter.set(v ? Number(v) : '');
    this.loadMonitor();
  }

  protected onStatusFilter(ev: Event): void {
    this.statusFilter.set((ev.target as HTMLSelectElement).value as 'all' | 'active' | 'inactive');
    this.loadMonitor();
  }

  protected setSort(
    column: 'userName' | 'targetTypeName' | 'targetAmount' | 'achievedAmount' | 'achievementPercent' | 'isActive',
  ): void {
    if (this.sortBy() === column) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(column);
      this.sortDir.set('asc');
    }
    this.loadMonitor();
  }

  protected fieldInvalid(name: keyof typeof this.targetForm.controls): boolean {
    const c = this.targetForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected formatMoney(value: number): string {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  /** Sets end date from start + period for the selected target type. Manual date edits remain allowed afterward. */
  private applyDatesForSelectedType(): void {
    const typeId = Number(this.targetForm.getRawValue().targetTypeId);
    if (!typeId) return;

    const type = this.targetTypes().find((t) => t.id === typeId);
    if (!type) return;

    const name = type.name.toLowerCase();
    // Custom: keep whatever dates the user chooses; do not overwrite.
    if (name.includes('custom')) return;

    const startRaw = this.targetForm.getRawValue().startDate;
    const start = startRaw ? new Date(`${startRaw}T00:00:00`) : new Date();
    if (Number.isNaN(start.getTime())) return;

    const end = new Date(start);
    if (name.includes('week')) {
      end.setDate(end.getDate() + 7);
    } else if (name.includes('month')) {
      end.setMonth(end.getMonth() + 1);
    }
    // Hourly / Daily (and unknown): same calendar day

    this.targetForm.patchValue(
      {
        startDate: this.formatLocalDate(start),
        endDate: this.formatLocalDate(end),
      },
      { emitEvent: false },
    );
  }

  private preferCustomTargetTypeId(): number {
    const custom = this.targetTypes().find((t) => t.name.toLowerCase().includes('custom'));
    return custom?.id ?? 0;
  }

  private formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

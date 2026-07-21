import { LowerCasePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import { ToastService } from '../../../core/toast/toast.service';
import { TextFormatter } from '../../../shared/utils/text-normalizer';
import type { MasterFormEntityConfig, MasterFormRow, MasterFormSaveResult } from './models/master-form.models';
import { MasterFormsService } from './services/master-forms.service';

@Component({
  selector: 'app-master-form-panel',
  imports: [ReactiveFormsModule, CrmModalComponent, LowerCasePipe],
  templateUrl: './master-form-panel.component.html',
  styleUrl: './master-form-panel.component.scss',
})
export class MasterFormPanelComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MasterFormsService);
  private readonly toast = inject(ToastService);

  readonly config = input.required<MasterFormEntityConfig>();

  protected readonly rows = signal<MasterFormRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly togglingId = signal<number | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    description: ['', [Validators.maxLength(500)]],
    isActive: [true],
    sortOrder: [0],
    isWon: [false],
    isLost: [false],
    isConversionStatus: [false],
  });

  protected readonly isDealStatuses = computed(() => this.config().slug === 'deal-statuses');
  protected readonly isLeadStatuses = computed(() => this.config().slug === 'lead-statuses');

  protected isConversionLeadStatus(row: MasterFormRow): boolean {
    return row.isConversionStatus === true;
  }
  protected readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = [...this.rows()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
    if (!q) return all;
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  });

  protected readonly modalTitle = computed(() => {
    const cfg = this.config();
    return this.editingId() == null ? `Add ${cfg.singularLabel}` : `Edit ${cfg.singularLabel}`;
  });

  protected readonly submitLabel = computed(() =>
    this.saving() ? 'Saving…' : this.editingId() == null ? 'Save' : 'Update',
  );

  constructor() {
    effect(() => {
      const cfg = this.config();
      this.searchQuery.set('');
      this.closeModal();
      this.reload(cfg);
    });
  }

  protected onSearch(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected openCreate(): void {
    this.editingId.set(null);
    const maxSort = this.rows().reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0);
    this.form.reset({
      name: '',
      description: '',
      isActive: true,
      sortOrder: maxSort + 10,
      isWon: false,
      isLost: false,
      isConversionStatus: false,
    });
    this.modalOpen.set(true);
  }

  protected openEdit(row: MasterFormRow): void {
    this.editingId.set(row.id);
    this.form.reset({
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      sortOrder: row.sortOrder ?? 0,
      isWon: row.isWon === true,
      isLost: row.isLost === true,
      isConversionStatus: row.isConversionStatus === true,
    });
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
    this.form.reset({
      name: '',
      description: '',
      isActive: true,
      sortOrder: 0,
      isWon: false,
      isLost: false,
      isConversionStatus: false,
    });
  }

  protected fieldInvalid(field: 'name' | 'description'): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected duplicateNameError(): string | null {
    const name = this.form.controls.name.value.trim().toLowerCase();
    if (!name) return null;
    const editId = this.editingId();
    const dup = this.rows().some(
      (r) => r.name.trim().toLowerCase() === name && r.id !== editId,
    );
    return dup ? 'A record with this name already exists.' : null;
  }

  protected submit(): void {
    const cfg = this.config();
    TextFormatter.formForEntity(this.form, cfg.slug);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.duplicateNameError()) return;

    const v = this.form.getRawValue();
    if (v.isWon && v.isLost) {
      this.toast.error('A stage cannot be both Won and Lost.');
      return;
    }

    const payload = {
      name: v.name.trim(),
      description: v.description.trim(),
      isActive: v.isActive,
      sortOrder: this.isDealStatuses() ? v.sortOrder : undefined,
      isWon: this.isDealStatuses() ? v.isWon : undefined,
      isLost: this.isDealStatuses() ? v.isLost : undefined,
      isConversionStatus: this.isLeadStatuses() ? v.isConversionStatus : undefined,
    };

    const editId = this.editingId();
    this.saving.set(true);

    const request$ =
      editId == null
        ? this.api.create(cfg.slug, payload)
        : this.api.update(cfg.slug, editId, { ...payload, id: editId });

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        if (!res.ok) {
          this.toast.error(res.error);
          return;
        }
        this.toast.success(editId == null ? 'Record created.' : 'Record updated.');
        this.closeModal();
        this.reload(cfg);
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not save. Please try again.');
      },
    });
  }

  protected toggleActive(row: MasterFormRow): void {
    if (this.togglingId() != null) return;

    const cfg = this.config();
    const next = !row.isActive;
    this.togglingId.set(row.id);

    this.api.setActive(cfg.slug, row.id, next).subscribe({
      next: (res) => {
        this.togglingId.set(null);
        if (!res.ok) {
          this.toast.error(res.error);
          return;
        }
        this.toast.success(next ? 'Record enabled.' : 'Record disabled.');
        this.reload(cfg);
      },
      error: () => {
        this.togglingId.set(null);
        this.toast.error('Could not update status. Please try again.');
      },
    });
  }

  protected moveStage(row: MasterFormRow, direction: -1 | 1): void {
    if (!this.isDealStatuses() || this.togglingId() != null) return;
    const ordered = [...this.rows()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
    const idx = ordered.findIndex((r) => r.id === row.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;

    const current = ordered[idx];
    const other = ordered[swapIdx];
    const currentOrder = current.sortOrder ?? idx * 10;
    const otherOrder = other.sortOrder ?? swapIdx * 10;

    this.togglingId.set(row.id);
    this.api
      .reorderDealStatuses([
        { id: current.id, sortOrder: otherOrder },
        { id: other.id, sortOrder: currentOrder },
      ])
      .subscribe({
        next: (res) => {
          this.togglingId.set(null);
          if (!res.ok) {
            this.toast.error(res.error);
            return;
          }
          this.toast.success('Pipeline order updated.');
          this.reload(this.config());
        },
        error: () => {
          this.togglingId.set(null);
          this.toast.error('Could not reorder stages.');
        },
      });
  }

  protected formatDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  private reload(cfg: MasterFormEntityConfig): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list(cfg.slug).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load records. Check that the API is running.');
      },
    });
  }
}

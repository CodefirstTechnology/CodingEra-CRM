import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import { DealsService } from '../../../core/services/deals.service';
import { leadsHttpErrorMessage } from '../../../core/services/leads.service';
import { ToastService } from '../../../core/toast/toast.service';
import {
  DEAL_EXPORT_DATE_PRESETS,
  type DealExportColumnOption,
  type DealExportDatePreset,
  type DealExportFilterOption,
  type DealExportRequest,
} from './deal-export.models';

@Component({
  selector: 'app-deal-export-modal',
  imports: [CrmModalComponent, FormsModule],
  templateUrl: './deal-export-modal.component.html',
  styleUrl: './deal-export-modal.component.scss',
})
export class DealExportModalComponent {
  readonly open = input(false);
  readonly columnOptions = input<DealExportColumnOption[]>([]);
  readonly defaultSelectedKeys = input<string[]>([]);
  readonly listFilters = input<Omit<DealExportRequest, 'columns' | 'datePreset' | 'fromDate' | 'toDate'>>(
    {},
  );
  readonly statusOptions = input<DealExportFilterOption[]>([]);
  readonly showOwnerFilter = input(false);
  readonly ownerOptions = input<DealExportFilterOption[]>([]);

  readonly dismiss = output<void>();
  readonly exported = output<void>();

  private readonly dealsService = inject(DealsService);
  private readonly toast = inject(ToastService);

  protected readonly datePresets = DEAL_EXPORT_DATE_PRESETS;
  protected readonly datePreset = signal<DealExportDatePreset>('all');
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly ownerFilter = signal('all');
  protected readonly columnSearch = signal('');
  protected readonly selectedKeys = signal<string[]>([]);
  protected readonly exporting = signal(false);
  protected readonly dateError = signal<string | null>(null);

  protected readonly isCustomDate = computed(() => this.datePreset() === 'custom');

  protected readonly filteredColumnOptions = computed(() => {
    const q = this.columnSearch().trim().toLowerCase();
    const options = this.columnOptions();
    if (!q) return options;
    return options.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  });

  protected readonly selectedCount = computed(() => this.selectedKeys().length);
  protected readonly allFilteredSelected = computed(() => {
    const visible = this.filteredColumnOptions();
    if (visible.length === 0) return false;
    const selected = new Set(this.selectedKeys());
    return visible.every((c) => selected.has(c.key));
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const defaults = this.defaultSelectedKeys();
      const available = new Set(this.columnOptions().map((c) => c.key));
      const initial =
        defaults.length > 0
          ? defaults.filter((k) => available.has(k))
          : this.columnOptions().map((c) => c.key);
      this.selectedKeys.set(initial);

      const filters = this.listFilters();
      this.statusFilter.set(filters.status?.trim() || 'all');
      this.ownerFilter.set(
        filters.dealOwnerId != null && filters.dealOwnerId > 0
          ? String(filters.dealOwnerId)
          : 'all',
      );
      this.datePreset.set('all');
      this.fromDate.set('');
      this.toDate.set('');
      this.columnSearch.set('');
      this.dateError.set(null);
    });
  }

  protected onDismiss(): void {
    if (this.exporting()) return;
    this.dismiss.emit();
  }

  protected onDatePresetChange(ev: Event): void {
    const value = (ev.target as HTMLSelectElement).value as DealExportDatePreset;
    this.datePreset.set(value);
    this.dateError.set(null);
  }

  protected onStatusFilterChange(ev: Event): void {
    this.statusFilter.set((ev.target as HTMLSelectElement).value || 'all');
  }

  protected onOwnerFilterChange(ev: Event): void {
    this.ownerFilter.set((ev.target as HTMLSelectElement).value || 'all');
  }

  protected isSelected(key: string): boolean {
    return this.selectedKeys().includes(key);
  }

  protected toggleColumn(key: string, checked: boolean): void {
    const current = this.selectedKeys();
    if (checked) {
      if (!current.includes(key)) this.selectedKeys.set([...current, key]);
      return;
    }
    this.selectedKeys.set(current.filter((k) => k !== key));
  }

  protected selectAllFiltered(): void {
    const selected = new Set(this.selectedKeys());
    for (const col of this.filteredColumnOptions()) {
      selected.add(col.key);
    }
    const order = this.columnOptions().map((c) => c.key);
    this.selectedKeys.set(order.filter((k) => selected.has(k)));
  }

  protected deselectAll(): void {
    this.selectedKeys.set([]);
  }

  protected async onExport(): Promise<void> {
    if (this.exporting()) return;

    const selected = this.selectedKeys();
    if (selected.length === 0) {
      this.toast.error('Select at least one column to export.');
      return;
    }

    const preset = this.datePreset();
    if (preset === 'custom') {
      const from = this.fromDate().trim();
      const to = this.toDate().trim();
      if (!from || !to) {
        this.dateError.set('Select both start and end dates.');
        return;
      }
      if (from > to) {
        this.dateError.set('Start date must be on or before end date.');
        return;
      }
    }
    this.dateError.set(null);

    const labelByKey = new Map(this.columnOptions().map((c) => [c.key, c.label]));
    const columns: DealExportColumnOption[] = selected.map((key) => ({
      key,
      label: labelByKey.get(key) ?? key,
    }));

    const filters = this.listFilters();
    const status = this.statusFilter();
    const owner = this.ownerFilter();
    const body: DealExportRequest = {
      ...filters,
      status: status !== 'all' ? status : undefined,
      datePreset: preset,
      columns,
    };
    if (status === 'all') delete body.status;

    if (this.showOwnerFilter() && owner !== 'all') {
      const ownerId = Number(owner);
      if (Number.isFinite(ownerId) && ownerId > 0) {
        body.dealOwnerId = ownerId;
      }
    } else {
      delete body.dealOwnerId;
    }

    if (preset === 'custom') {
      body.fromDate = this.fromDate().trim();
      body.toDate = this.toDate().trim();
    }

    this.exporting.set(true);
    try {
      await firstValueFrom(this.dealsService.exportDeals(body));
      this.toast.success('Deals exported successfully.');
      this.exported.emit();
      this.dismiss.emit();
    } catch (err) {
      this.toast.error(leadsHttpErrorMessage(err));
    } finally {
      this.exporting.set(false);
    }
  }
}

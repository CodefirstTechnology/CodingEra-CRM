import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import { LeadsService, leadsHttpErrorMessage } from '../../../core/services/leads.service';
import { ToastService } from '../../../core/toast/toast.service';
import {
  LEAD_EXPORT_DATE_PRESETS,
  type LeadExportColumnOption,
  type LeadExportDatePreset,
  type LeadExportFilterOption,
  type LeadExportRequest,
} from './lead-export.models';

@Component({
  selector: 'app-lead-export-modal',
  imports: [CrmModalComponent, FormsModule],
  templateUrl: './lead-export-modal.component.html',
  styleUrl: './lead-export-modal.component.scss',
})
export class LeadExportModalComponent {
  readonly open = input(false);
  /** Listing column options (same metadata as the table). */
  readonly columnOptions = input<LeadExportColumnOption[]>([]);
  /** Currently visible listing columns — used as default selection. */
  readonly defaultSelectedKeys = input<string[]>([]);
  /** Active listing filters forwarded to the export API. */
  readonly listFilters = input<Omit<LeadExportRequest, 'columns' | 'datePreset' | 'fromDate' | 'toDate'>>(
    {},
  );
  /** Same source options as the Lead Listing toolbar. */
  readonly sourceOptions = input<LeadExportFilterOption[]>([]);
  /** Same status options as the Lead Listing toolbar. */
  readonly statusOptions = input<LeadExportFilterOption[]>([]);

  readonly dismiss = output<void>();
  readonly exported = output<void>();

  private readonly leadsService = inject(LeadsService);
  private readonly toast = inject(ToastService);

  protected readonly datePresets = LEAD_EXPORT_DATE_PRESETS;
  protected readonly datePreset = signal<LeadExportDatePreset>('all');
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly sourceFilter = signal('all');
  protected readonly statusFilter = signal('all');
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
      this.sourceFilter.set(filters.leadSource?.trim() || 'all');
      this.statusFilter.set(filters.status?.trim() || 'all');
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
    const value = (ev.target as HTMLSelectElement).value as LeadExportDatePreset;
    this.datePreset.set(value);
    this.dateError.set(null);
  }

  protected onSourceFilterChange(ev: Event): void {
    this.sourceFilter.set((ev.target as HTMLSelectElement).value || 'all');
  }

  protected onStatusFilterChange(ev: Event): void {
    this.statusFilter.set((ev.target as HTMLSelectElement).value || 'all');
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
    // Preserve listing column order for selected set.
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
    const columns: LeadExportColumnOption[] = selected.map((key) => ({
      key,
      label: labelByKey.get(key) ?? key,
    }));

    const filters = this.listFilters();
    const source = this.sourceFilter();
    const status = this.statusFilter();
    const body: LeadExportRequest = {
      ...filters,
      leadSource: source !== 'all' ? source : undefined,
      status: status !== 'all' ? status : undefined,
      datePreset: preset,
      columns,
    };
    if (source === 'all') delete body.leadSource;
    if (status === 'all') delete body.status;

    if (preset === 'custom') {
      body.fromDate = this.fromDate().trim();
      body.toDate = this.toDate().trim();
    }

    this.exporting.set(true);
    try {
      await firstValueFrom(this.leadsService.exportLeads(body));
      this.toast.success('Leads exported successfully.');
      this.exported.emit();
      this.dismiss.emit();
    } catch (err) {
      this.toast.error(leadsHttpErrorMessage(err));
    } finally {
      this.exporting.set(false);
    }
  }
}

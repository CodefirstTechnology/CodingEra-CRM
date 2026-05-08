import { Component, computed, DestroyRef, inject, NgZone, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { concat, concatMap, defaultIfEmpty, EMPTY, forkJoin, of, last, take, tap } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { DealsService } from '../../core/services/deals.service';
import { LeadsService } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { CrmAssignPickerComponent } from '../../shared/components/crm-assign-picker/crm-assign-picker.component';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { mapLeadToDealRow } from '../../shared/utils/mappers';
import { createIdSelection } from '../../shared/utils/selection-manager';
import { optionalUrlValidator } from '../../shared/validators/crm-validators';
import { environment } from '../../../environments/environment';
import type { IndiaMartLeadStatus } from '../indiamartlead/indiamart-lead.model';
import { INDIA_MART_LEAD_STATUSES } from '../indiamartlead/indiamart-lead.model';
import {
  isIndiamartLeadRowId,
  mapIndiaMartLeadToLeadRow,
  parseIndiamartNumericIdFromRowId,
} from '../indiamartlead/indiamart-lead.mapper';
import { IndiamartLeadsService } from '../indiamartlead/indiamart-leads.service';
import type {
  LeadListSourceFilter,
  LeadListStatusFilter,
  LeadOwnerOption,
  LeadRow,
  LeadSource,
  LeadStatus,
} from './lead-row.model';

/** @deprecated Import from `./lead-row.model` instead. */
export type { LeadListStatusFilter as StatusFilter, LeadRow, LeadOwnerOption, LeadStatus } from './lead-row.model';

@Component({
  selector: 'app-leads',
  imports: [ReactiveFormsModule, RouterLink, CrmSelectionBarComponent, CrmAssignPickerComponent],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.scss',
})
export class LeadsComponent {
  /** Exposes feature flag for template (simulate + merged IndiaMART list). */
  protected readonly enableIndiamartLead = environment.enableIndiamartLead;

  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly indiamartLeadsService = inject(IndiamartLeadsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  protected readonly sel = createIdSelection();
  protected readonly assignPickerOpen = signal(false);
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);
  /** Shown read-only in the lead modal (manual CRM flows only; IndiaMART rows never open this form). */
  protected readonly modalLeadSource = signal<LeadSource>('Manual');
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<LeadListStatusFilter>('all');
  protected readonly sourceFilter = signal<LeadListSourceFilter>('all');

  protected readonly statusOptions: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Lost'];
  protected readonly indiaMartStatusOptions = [...INDIA_MART_LEAD_STATUSES];
  protected readonly salutationOptions = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;
  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;
  protected readonly employeeOptions = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
  protected readonly territoryOptions = ['', 'India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;
  protected readonly industryOptions = [
    'Technology',
    'Finance',
    'Healthcare',
    'Manufacturing',
    'Retail',
    'Education',
    'Other',
  ] as const;
  protected readonly requestTypeOptions = ['', 'Sales', 'Support', 'Partnership', 'General inquiry'] as const;

  protected readonly leadOwnerOptions: LeadOwnerOption[] = [
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly filterChips: { id: LeadListStatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'New', label: 'New' },
    { id: 'Contacted', label: 'Contacted' },
    { id: 'Qualified', label: 'Qualified' },
    { id: 'Lost', label: 'Lost' },
  ];

  protected readonly sourceFilterChips: { id: LeadListSourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'Manual', label: 'Manual' },
    { id: 'IndiaMART', label: 'IndiaMART' },
  ];

  /** Manual / API-backed rows only; merged with IndiaMART in {@link rows}. */
  protected readonly manualRows = signal<LeadRow[]>([]);

  constructor() {
    this.refreshLeads();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'lead') return;
      this.refreshLeads();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });

    const pollMs = environment.indiamartAutoSimulateIntervalMs ?? 0;
    const durationMs = environment.indiamartAutoSimulateDurationMs ?? 0;
    if (environment.enableIndiamartLead && pollMs > 0) {
      this.indiamartLeadsService.startDemoAutoSimulation({
        intervalMs: pollMs,
        durationMs,
        onLeadAdded: () => this.toast.show('New IndiaMART Lead Received'),
        onSessionEnd: () =>
          this.toast.show('IndiaMART demo simulation ended — all IndiaMART leads cleared.'),
      });
      this.destroyRef.onDestroy(() => {
        this.indiamartLeadsService.stopDemoAutoSimulation('LeadsComponent destroyed');
      });
    }
  }

  /** Unified list: manual CRM leads + IndiaMART (when feature flag is on), sorted by recency. */
  protected readonly rows = computed(() => this.buildMergedRows());

  private buildMergedRows(): LeadRow[] {
    const manual = this.manualRows().map((r) => {
      const leadSource: LeadSource = r.leadSource === 'IndiaMART' ? 'IndiaMART' : 'Manual';
      const idNum = Number(r.id);
      return {
        ...r,
        leadSource,
        sortTimestamp: r.sortTimestamp ?? this.manualUpdatedSortKey(r.updated, idNum),
      };
    });
    if (!environment.enableIndiamartLead) {
      return manual;
    }
    const imSnapshot = this.indiamartLeadsService.leads();
    const im = imSnapshot.map(mapIndiaMartLeadToLeadRow);
    return [...manual, ...im].sort((a, b) => (b.sortTimestamp ?? 0) - (a.sortTimestamp ?? 0));
  }

  private manualUpdatedSortKey(updated: string, numericId: number): number {
    const u = updated.trim().toLowerCase();
    const now = Date.now();
    if (u === 'just now' || u.includes('today')) return now;
    if (u.includes('yesterday')) return now - 86400000;
    const d = u.match(/^(\d+)\s*d\s*ago$/);
    if (d) return now - Number(d[1]) * 86400000;
    const w = u.match(/^(\d+)\s*w\s*ago$/);
    if (w) return now - Number(w[1]) * 604800000;
    const parsed = Date.parse(updated);
    if (!Number.isNaN(parsed)) return parsed;
    return Number.isFinite(numericId) ? 1e12 - numericId : 0;
  }

  private refreshLeads(): void {
    this.leadsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.manualRows.set(rows));
  }

  protected readonly filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const st = this.statusFilter();
    const src = this.sourceFilter();
    return this.rows().filter((row) => {
      if (src !== 'all' && (row.leadSource ?? 'Manual') !== src) return false;
      if (st !== 'all' && row.status !== st) return false;
      if (!q) return true;
      const srcLabel = (row.leadSource ?? 'Manual').toLowerCase();
      return (
        row.name.toLowerCase().includes(q) ||
        row.firstName.toLowerCase().includes(q) ||
        row.lastName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.mobile?.toLowerCase().includes(q) ?? false) ||
        row.organization.toLowerCase().includes(q) ||
        row.owner.toLowerCase().includes(q) ||
        row.leadOwnerName.toLowerCase().includes(q) ||
        row.industry.toLowerCase().includes(q) ||
        (row.notes?.toLowerCase().includes(q) ?? false) ||
        srcLabel.includes(q)
      );
    });
  });

  protected readonly allSelectedFiltered = computed(() =>
    this.sel.allSelectedIn(this.filtered().map((r) => r.id)),
  );

  protected readonly assignDefaultOwnerId = computed(() => {
    const ids = this.sel.selectedItems();
    const first = this.rows().find((r) => r.id === ids[0]);
    if (!first) return 'SK';
    return (
      this.leadOwnerOptions.find((o) => o.initials === first.owner || o.label === first.leadOwnerName)?.id ??
      'SK'
    );
  });

  protected readonly bulkCanEditSingleManual = computed(() => {
    if (this.sel.selectedCount() !== 1) return false;
    const id = this.sel.selectedItems()[0];
    return this.rows().find((r) => r.id === id)?.leadSource === 'Manual';
  });

  protected readonly bulkAssignEnabled = computed(() => {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return false;
    return ids.every((id) => this.rows().find((r) => r.id === id)?.leadSource === 'Manual');
  });

  protected readonly bulkConvertEnabled = computed(() => {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const r = this.rows().find((x) => x.id === id);
      return !!r && r.leadSource === 'Manual' && r.status !== 'Converted';
    });
  });

  protected readonly createForm = this.fb.nonNullable.group({
    salutation: [''],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    gender: [''],
    organization: ['', [Validators.required, Validators.maxLength(160)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(32)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    territory: [''],
    industry: ['Technology', Validators.required],
    status: this.fb.nonNullable.control<LeadStatus>('New', Validators.required),
    leadOwner: ['SK', Validators.required],
    requestType: [''],
    customField: ['', Validators.maxLength(240)],
  });

  private clearEditQuery(): void {
    this.lastRouteEdit = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
    });
  }

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.modalLeadSource.set('Manual');
    this.clearEditQuery();
    this.createForm.reset({
      salutation: '',
      lastName: '',
      mobile: '',
      firstName: '',
      email: '',
      gender: '',
      organization: '',
      employees: '1-10',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: 'Technology',
      status: 'New',
      leadOwner: 'SK',
      requestType: '',
      customField: '',
    });
    this.createForm.markAsUntouched();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.modalLeadSource.set('Manual');
    this.clearEditQuery();
    this.createForm.reset({
      salutation: '',
      lastName: '',
      mobile: '',
      firstName: '',
      email: '',
      gender: '',
      organization: '',
      employees: '1-10',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: 'Technology',
      status: 'New',
      leadOwner: 'SK',
      requestType: '',
      customField: '',
    });
    this.createForm.markAsUntouched();
  }

  private beginEditFromRoute(idStr: string): void {
    if (isIndiamartLeadRowId(idStr)) return;
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.leadsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        this.modalLeadSource.set(row.leadSource ?? 'Manual');
        const ownerOpt = this.leadOwnerOptions.find(
          (o) => o.initials === row.owner || o.label === row.leadOwnerName,
        );
        const ar = row.annualRevenue?.trim() ?? '';
        const arInput = ar.startsWith('₹') ? ar.replace(/^₹\s*/, '').trim() : ar;
        this.createForm.patchValue({
          salutation: row.salutation ?? '',
          lastName: row.lastName ?? '',
          mobile: (row.mobile ?? '').replace(/\D/g, '').slice(-10) || row.mobile || '',
          firstName: row.firstName ?? '',
          email: row.email ?? '',
          gender: row.gender ?? '',
          organization: row.organization ?? '',
          employees: row.employees ?? '1-10',
          annualRevenue: arInput,
          website: row.website ?? '',
          territory: row.territory ?? '',
          industry: row.industry ?? 'Technology',
          status: row.status ?? 'New',
          leadOwner: ownerOpt?.id ?? row.leadOwnerId ?? 'SK',
          requestType: row.requestType ?? '',
          customField: row.notes ?? '',
        });
        this.formOpen.set(true);
      });
  }

  protected toggleRowSelection(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.sel.toggle(id);
  }

  protected toggleSelectAllFiltered(): void {
    this.sel.toggleSelectAll(this.filtered().map((r) => r.id));
  }

  protected onBulkEdit(): void {
    if (!this.bulkCanEditSingleManual()) return;
    const ids = this.sel.selectedItems();
    if (ids.length !== 1) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: ids[0] },
      queryParamsHandling: 'merge',
    });
    this.beginEditFromRoute(ids[0]);
  }

  protected onBulkDelete(): void {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) => {
      const imId = parseIndiamartNumericIdFromRowId(sid);
      if (imId != null) {
        return of(null).pipe(tap(() => this.indiamartLeadsService.deleteLead(imId)));
      }
      return this.leadsService.delete(Number(sid)).pipe(take(1));
    });
    forkJoin(streams).subscribe(() => {
      this.sel.clear();
      this.refreshLeads();
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected onAssignToMenu(): void {
    this.assignPickerOpen.set(true);
  }

  protected onAssignClosed(): void {
    this.assignPickerOpen.set(false);
  }

  protected onAssignPicked(ownerKey: string): void {
    const opt = this.leadOwnerOptions.find((o) => o.id === ownerKey);
    if (!opt) {
      this.assignPickerOpen.set(false);
      return;
    }
    if (!this.bulkAssignEnabled()) {
      this.assignPickerOpen.set(false);
      return;
    }
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.leadsService
        .update(Number(sid), {
          leadOwnerName: opt.label,
          owner: opt.initials,
          updated: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe(() => {
      this.assignPickerOpen.set(false);
      this.sel.clear();
      this.refreshLeads();
    });
  }

  protected onClearAssignmentBulk(): void {
    if (!this.bulkAssignEnabled()) return;
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.leadsService
        .update(Number(sid), {
          leadOwnerName: '—',
          owner: '—',
          updated: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe(() => {
      this.sel.clear();
      this.refreshLeads();
    });
  }

  protected convertToDeal(): void {
    if (!this.bulkConvertEnabled()) return;
    const ids = [...this.sel.selectedItems()];
    if (ids.length === 0) return;

    const streams = ids
      .map((sid) => {
        const lead = this.rows().find((r) => r.id === sid);
        if (!lead || lead.leadSource !== 'Manual' || lead.status === 'Converted') return null;
        const idn = Number(sid);
        if (!Number.isFinite(idn)) return null;
        const after = environment.leadConversionAfterDeal;
        return this.dealsService.create(mapLeadToDealRow(lead)).pipe(
          take(1),
          tap((created) => this.createRowBus.publish('deal', created)),
          concatMap(() =>
            after === 'delete'
              ? this.leadsService.delete(idn).pipe(take(1))
              : this.leadsService
                  .update(idn, { status: 'Converted', updated: 'Just now' })
                  .pipe(take(1)),
          ),
        );
      })
      .filter((s): s is NonNullable<typeof s> => s != null);

    if (streams.length === 0) {
      this.sel.clear();
      this.refreshLeads();
      return;
    }

    const convertedCount = streams.length;
    concat(...streams)
      .pipe(last(), defaultIfEmpty(null))
      .subscribe(() => {
        this.sel.clear();
        this.refreshLeads();
        if (convertedCount > 0 && environment.showLeadConvertSuccessMessage) {
          window.alert('Lead converted to deal successfully');
        }
      });
  }

  protected clearEmailDuplicate(): void {
    const emailCtrl = this.createForm.get('email');
    const errs = emailCtrl?.errors;
    if (!emailCtrl || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    emailCtrl.setErrors(Object.keys(next).length ? next : null);
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.sourceFilter.set('all');
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected setStatusFilter(id: LeadListStatusFilter): void {
    this.statusFilter.set(id);
  }

  protected setSourceFilter(id: LeadListSourceFilter): void {
    this.sourceFilter.set(id);
  }

  protected isChipActive(id: LeadListStatusFilter): boolean {
    return this.statusFilter() === id;
  }

  protected isSourceChipActive(id: LeadListSourceFilter): boolean {
    return this.sourceFilter() === id;
  }

  private buildDisplayName(salutation: string, first: string, last: string): string {
    const parts = [salutation.trim(), first.trim(), last.trim()].filter(Boolean);
    return parts.join(' ').trim() || first.trim() || last.trim() || 'Lead';
  }

  protected submitLead(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const emailTrim = raw.email.trim();
    const emailLower = emailTrim.toLowerCase();
    const emailCtrl = this.createForm.get('email');
    const editId = this.editingNumericId();
    if (
      emailTrim &&
      this.rows().some(
        (r) =>
          r.email.toLowerCase() === emailLower && (editId == null || Number(r.id) !== editId),
      )
    ) {
      if (emailCtrl) {
        emailCtrl.setErrors({ ...(emailCtrl.errors ?? {}), duplicate: true });
        emailCtrl.markAsTouched();
      }
      return;
    }

    const ownerOpt = this.leadOwnerOptions.find((o) => o.id === raw.leadOwner);
    const initials = ownerOpt?.initials ?? raw.leadOwner;
    const leadOwnerName = ownerOpt?.label ?? raw.leadOwner;

    const payload: Omit<LeadRow, 'id'> = {
      salutation: raw.salutation || undefined,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      name: this.buildDisplayName(raw.salutation, raw.firstName, raw.lastName),
      mobile: raw.mobile.trim(),
      leadOwnerId: raw.leadOwner,
      gender: raw.gender || undefined,
      email: emailTrim,
      organization: raw.organization.trim(),
      employees: raw.employees,
      annualRevenue: raw.annualRevenue.trim() || undefined,
      website: raw.website.trim() || undefined,
      territory: raw.territory || undefined,
      industry: raw.industry,
      status: raw.status,
      requestType: raw.requestType || undefined,
      notes: raw.customField.trim() || undefined,
      leadOwnerName,
      owner: initials,
      updated: 'Just now',
      leadSource: 'Manual',
    };

    const done = () => {
      this.sel.clear();
      this.refreshLeads();
      this.closeForm();
    };

    if (editId != null) {
      this.leadsService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe(() => done());
    } else {
      this.leadsService
        .create(payload)
        .pipe(take(1))
        .subscribe(() => done());
    }
  }

  protected deleteLead(row: LeadRow, ev: Event): void {
    ev.stopPropagation();
    const imId = parseIndiamartNumericIdFromRowId(row.id);
    if (imId != null) {
      this.indiamartLeadsService.deleteLead(imId);
      this.sel.removeId(row.id);
      return;
    }
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.leadsService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.sel.removeId(row.id);
        this.refreshLeads();
      });
  }

  protected onIndiaMartStatusChange(row: LeadRow, ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value as IndiaMartLeadStatus;
    const n = parseIndiamartNumericIdFromRowId(row.id);
    if (n == null) return;
    this.indiamartLeadsService.updateLeadStatus(n, v);
  }

  protected simulateIndiaMartLead(): void {
    this.ngZone.run(() => {
      this.indiamartLeadsService.addLead(this.indiamartLeadsService.buildRandomLead());
    });
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected statusClass(status: LeadStatus): string {
    switch (status) {
      case 'Qualified':
        return 'leads__tag leads__tag--ok';
      case 'Contacted':
        return 'leads__tag leads__tag--accent';
      case 'Lost':
        return 'leads__tag leads__tag--bad';
      case 'Converted':
        return 'leads__tag leads__tag--ok';
      default:
        return 'leads__tag leads__tag--muted';
    }
  }

  protected leadSourceLabel(row: LeadRow): LeadSource {
    return row.leadSource ?? 'Manual';
  }

  protected leadSourceClass(row: LeadRow): string {
    return this.leadSourceBadgeClass(this.leadSourceLabel(row));
  }

  protected leadSourceBadgeClass(src: LeadSource): string {
    return src === 'IndiaMART' ? 'leads__tag leads__tag--src-im' : 'leads__tag leads__tag--src-manual';
  }

  protected hasActiveFilters(): boolean {
    return (
      this.statusFilter() !== 'all' ||
      this.sourceFilter() !== 'all' ||
      this.searchQuery().trim().length > 0
    );
  }
}

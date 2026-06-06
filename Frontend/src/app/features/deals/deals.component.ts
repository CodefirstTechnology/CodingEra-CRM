import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { DealsService } from '../../core/services/deals.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { PermissionService } from '../../core/services/permission.service';
import { AuthService } from '../../core/auth/auth.service';
import { resolveRecordOwnerIdForSubmit, showOwnerPickerOnCreate, showSelfAssignedOwnerOnCreate } from '../../shared/utils/record-owner-assignment.util';
import { LeadOwnerOptionsService } from '../../core/services/leads/lead-owner-options.service';
import { DealMasterSelectService } from '../../core/services/deals/deal-master-select.service';
import {
  masterOptionFormValue,
  masterSelectControlValue,
  resolveOrgMasterPick,
} from '../../core/services/organizations/organization-master-select.util';
import {
  resolveDealStatusLabel,
  resolveDealStatusSelectValue,
  dealStatusCssKind,
} from '../../core/services/deals/deal-status.constants';
import type { DealPipelineStatus } from '../../core/services/deals/deal-pipeline.constants';
import { DEFAULT_DEAL_PIPELINE_STATUS } from '../../core/services/deals/deal-pipeline.constants';
import { CrmAssignPickerComponent } from '../../shared/components/crm-assign-picker/crm-assign-picker.component';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { DealPipelineBoardComponent } from './deal-pipeline-board.component';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import {
  GSTIN_ERROR_KEY,
  GSTIN_ERROR_MESSAGE,
  gstControlInvalid,
  normalizeGstin,
  syncGstinInputFromEvent,
} from '../../shared/utils/gstin.util';
import {
  gstFormValidators,
  optionalEmailValidator,
  optionalPhoneValidator,
  optionalUrlValidator,
} from '../../shared/validators/crm-validators';
import { createIdSelection } from '../../shared/utils/selection-manager';
import { leadPersonName } from '../../shared/utils/lead-person-name.util';
import { fullNameFromLeadParts, splitFullName } from '../leads/lead-full-name.util';

export type { DealPipelineStatus };

export type DealListStatusFilter = 'all' | DealPipelineStatus;

/** Admin deals list: `'all'` or a {@link DealOwnerOption.id}. */
export type DealListOwnerFilter = 'all' | string;

export interface DealOwnerOption {
  id: string;
  label: string;
  initials: string;
}

export interface DealRow {
  id: string;
  organizationName: string;
  employees: string;
  /** Master data FK (`/api/MasterData/employee-counts`). */
  employeeCountId?: number | null;
  /** Stored as a plain number (no currency formatting). */
  annualRevenue: number;
  website: string;
  gst?: string;
  territory: string;
  /** Master data FK (`/api/MasterData/territories`). */
  territoryId?: number | null;
  industry: string;
  /** Master data FK (`/api/MasterData/industries`). */
  industryId?: number | null;
  salutation: string;
  /** Master data FK (`/api/MasterData/salutations`). */
  salutationId?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  gender: string;
  status: DealPipelineStatus;
  /** Master data FK when `/api/MasterData/deal-statuses` is available. */
  dealStatusId?: number | null;
  /** Form / owner picker key (numeric `users.id`). */
  dealOwnerId: string;
  /** Backend `assignedToUserId` / `users.id`. */
  assignedToUserId?: string;
  assignedTo: string;
  assignedInitials: string;
  /** Human-readable label for tables (e.g. "2w ago"). */
  lastModified: string;
  /** ISO `last_modified` / `updated_at` from API — use for date math, not display. */
  lastModifiedAt?: string;
  /** ISO `created_at` from API — use for date math, not display. */
  createdAtAt?: string;
  /** When set, deal appears on the matching contact's detail "Deals" tab. */
  relatedContactId?: string;
  organizationId?: string;
  /** When set, deal appears on the matching organization's detail "Deals" tab. */
  relatedOrganizationId?: string;
  /** Win probability (e.g. 10 = 10%). */
  probabilityPercent?: number;
  nextStep?: string;
  /** ISO next follow-up date from API. */
  nextFollowUpDate?: string;
  requirement?: string;
  /** Display title for list/detail (e.g. "Acme — Jane Doe"). */
  dealTitle?: string;
  /** Combined contact label from conversion. */
  contactName?: string;
  notes?: string;
  /** ISO created time when known (conversion sets this client-side). */
  createdAt?: string;
  /** CRM origin label (`Converted Lead`, `lead_conversion`, etc.). */
  source?: string;
  /** Source lead id when created via lead conversion (local store + future API FK). */
  sourceLeadId?: string;
  /** Set when deal is closed as lost. */
  lostReason?: string;
}

interface DealColumnOption {
  id: string;
  label: string;
  required: boolean;
}

@Component({
  selector: 'app-deals',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CrmSelectionBarComponent,
    CrmAssignPickerComponent,
    DealPipelineBoardComponent,
  ],
  templateUrl: './deals.component.html',
  styleUrl: './deals.component.scss',
})
export class DealsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly dealsService = inject(DealsService);
  private readonly toast = inject(ToastService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly permissions = inject(PermissionService);
  private readonly ownerOpts = inject(LeadOwnerOptionsService);
  protected readonly dealMaster = inject(DealMasterSelectService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly assignPickerOpen = signal(false);
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);
  protected readonly columnMenuOpen = signal(false);
  protected readonly listView = signal<'table' | 'pipeline'>('table');
  protected readonly stageUpdatingId = signal<string | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<DealListStatusFilter>('all');
  protected readonly ownerFilter = signal<DealListOwnerFilter>('all');

  protected readonly dealStatuses = this.dealMaster.statusSelectOptions;

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  protected readonly dealOwnerOptions = this.ownerOpts.options;
  protected readonly masterOptionFormValue = masterOptionFormValue;
  protected readonly isAdminViewer = computed(() => this.userScope.isAdminSession());
  protected readonly canAssignDeals = computed(() => this.permissions.canAssignDeals());
  protected readonly canManageDealAssignment = computed(
    () => this.canAssignDeals() && this.isAdminViewer(),
  );
  protected readonly showDealOwnerPicker = computed(() =>
    showOwnerPickerOnCreate(this.canAssignDeals(), this.isAdminViewer()),
  );
  protected readonly showSelfAssignedDealOwner = computed(() =>
    showSelfAssignedOwnerOnCreate(this.canAssignDeals(), this.isAdminViewer()),
  );

  protected readonly statusFilterOptions = computed(() => {
    const items: { id: DealListStatusFilter; label: string }[] = [
      { id: 'all', label: 'All statuses' },
    ];
    const seen = new Set<string>();
    for (const opt of this.dealStatuses()) {
      const name = opt.name.trim();
      if (!name) continue;
      const id = resolveDealStatusLabel(name);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, label: name });
    }
    return items;
  });

  protected readonly ownerFilterOptions = computed(() => {
    const items: { id: DealListOwnerFilter; label: string }[] = [
      { id: 'all', label: 'All owners' },
    ];
    for (const opt of this.dealOwnerOptions()) {
      items.push({ id: opt.id, label: opt.label });
    }
    return items;
  });

  protected readonly rows = signal<DealRow[]>([]);

  protected readonly filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const st = this.statusFilter();
    const owner = this.ownerFilter();
    const filterByOwner = this.isAdminViewer() && owner !== 'all';
    return this.rows().filter((row) => {
      if (filterByOwner && !this.rowMatchesOwnerFilter(row, owner)) return false;
      if (st !== 'all' && !this.rowMatchesStatusFilter(row, st)) return false;
      if (!q) return true;
      const contact = this.dealContactName(row).toLowerCase();
      return (
        contact.includes(q) ||
        row.firstName.toLowerCase().includes(q) ||
        row.lastName.toLowerCase().includes(q) ||
        row.organizationName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.mobile.toLowerCase().includes(q) ||
        row.assignedTo.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q) ||
        (row.requirement?.toLowerCase().includes(q) ?? false) ||
        (row.territory?.toLowerCase().includes(q) ?? false) ||
        row.industry.toLowerCase().includes(q) ||
        (row.dealTitle?.toLowerCase().includes(q) ?? false) ||
        (row.nextStep?.toLowerCase().includes(q) ?? false) ||
        (row.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  });
  private readonly requiredColumnIds = new Set(['contactName', 'organizationName', 'assignedTo']);
  private readonly selectedColumnIds = signal<string[]>([
    'contactName',
    'organizationName',
    'assignedTo',
    'annualRevenue',
    'status',
  ]);
  private readonly ignoredColumnIds = new Set([
    'id',
    'dealOwnerId',
    'assignedInitials',
    'relatedContactId',
    'relatedOrganizationId',
    'firstName',
    'lastName',
    'salutation',
  ]);
  private readonly preferredColumnOrder = [
    'contactName',
    'organizationName',
    'annualRevenue',
    'status',
    'email',
    'mobile',
    'assignedTo',
    'lastModified',
    'employees',
    'website',
    'territory',
    'industry',
    'requirement',
    'gender',
    'probabilityPercent',
    'nextStep',
  ];
  private readonly columnLabels: Record<string, string> = {
    contactName: 'Name',
    organizationName: 'Organization',
    email: 'Email',
    mobile: 'Mobile',
    annualRevenue: 'Annual revenue',
    assignedTo: 'Assigned to',
    lastModified: 'Last modified',
    probabilityPercent: 'Probability',
    nextStep: 'Next step',
  };

  constructor() {
    this.ownerOpts.load();
    this.dealMaster.ensureStatusesLoaded().pipe(take(1)).subscribe();
    this.refreshDeals();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'deal') return;
      const created = e.row as DealRow;
      if (created?.id) {
        this.rows.update((rows) => {
          if (rows.some((r) => r.id === created.id)) return rows;
          return [created, ...rows];
        });
      } else {
        this.refreshDeals();
      }
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      if (q['create'] === '1') {
        this.openForm();
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { create: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        return;
      }
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshDeals(): void {
    this.userScope
      .listDeals()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.filtered().map((r) => r.id)),
  );

  protected readonly columnOptions = computed<DealColumnOption[]>(() => {
    const ids = new Set(this.preferredColumnOrder);
    for (const row of this.rows()) {
      for (const key of Object.keys(row)) {
        if (!this.ignoredColumnIds.has(key)) {
          ids.add(key);
        }
      }
    }
    return [...ids]
      .filter((id) => !this.ignoredColumnIds.has(id))
      .map((id) => ({
        id,
        label: this.columnLabels[id] ?? this.titleizeColumnId(id),
        required: this.requiredColumnIds.has(id),
      }));
  });

  protected readonly visibleColumns = computed(() =>
    this.columnOptions().filter((column) => this.isColumnVisible(column.id)),
  );

  protected readonly assignDefaultOwnerId = computed(() => {
    const ids = this.sel.selectedItems();
    const first = this.rows().find((r) => r.id === ids[0]);
    if (first) {
      const resolved = this.ownerOpts.resolveDealSelectValue(first);
      if (resolved) return resolved;
    }
    return this.ownerOpts.defaultOwnerId() || '';
  });

  protected readonly createForm = this.fb.nonNullable.group({
    useExistingOrg: [false],
    useExistingContact: [false],
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(40)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    gst: ['', gstFormValidators()],
    territory: [''],
    industry: ['Technology', Validators.required],
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    primaryMobile: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
    primaryEmail: ['', [Validators.maxLength(160), optionalEmailValidator()]],
    gender: [''],
    status: this.fb.nonNullable.control<string>(DEFAULT_DEAL_PIPELINE_STATUS, Validators.required),
    dealOwner: [this.ownerOpts.defaultOwnerId(), Validators.required],
    requirement: ['', Validators.maxLength(240)],
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
    this.sel.toggleSelectAll(this.filtered().map((r) => r.id));
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.ownerFilter.set('all');
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected setStatusFilter(id: DealListStatusFilter): void {
    this.statusFilter.set(id);
  }

  protected onStatusFilterSelect(ev: Event): void {
    this.setStatusFilter((ev.target as HTMLSelectElement).value as DealListStatusFilter);
  }

  protected setOwnerFilter(id: DealListOwnerFilter): void {
    this.ownerFilter.set(id);
  }

  protected onOwnerFilterSelect(ev: Event): void {
    this.setOwnerFilter((ev.target as HTMLSelectElement).value as DealListOwnerFilter);
  }

  protected hasActiveFilters(): boolean {
    return (
      this.statusFilter() !== 'all' ||
      (this.isAdminViewer() && this.ownerFilter() !== 'all') ||
      this.searchQuery().trim().length > 0
    );
  }

  protected toggleColumnMenu(): void {
    this.columnMenuOpen.update((open) => !open);
  }

  protected toggleColumn(id: string): void {
    if (this.requiredColumnIds.has(id)) return;
    this.selectedColumnIds.update((selected) =>
      selected.includes(id) ? selected.filter((columnId) => columnId !== id) : [...selected, id],
    );
  }

  protected isColumnVisible(id: string): boolean {
    return this.requiredColumnIds.has(id) || this.selectedColumnIds().includes(id);
  }

  /** Primary contact name from `first_name` + `last_name` on the deal row. */
  protected dealContactName(row: DealRow): string {
    return leadPersonName({
      firstName: row.firstName,
      lastName: row.lastName,
      name: '',
    });
  }

  protected displayColumnValue(row: DealRow, id: string): string {
    if (id === 'contactName') {
      return this.dealContactName(row);
    }
    const value = (row as unknown as Record<string, unknown>)[id];
    if (value == null) return '-';
    if (typeof value === 'string') return value.trim() || '-';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '-';
  }

  protected dealEmailInputValue(row: DealRow): string {
    const e = row.email?.trim();
    return e && e !== '—' ? e : '';
  }

  protected dealMobileInputValue(row: DealRow): string {
    const m = row.mobile?.trim();
    return m && m !== '—' ? m : '';
  }

  protected onDealEmailBlur(row: DealRow, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const raw = input.value.trim();
    const previous = this.dealEmailInputValue(row);
    if (raw === previous) return;

    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      input.value = previous;
      this.toast.error('Enter a valid email.');
      return;
    }

    const idn = Number(row.id);
    if (!Number.isFinite(idn)) return;
    if (
      raw &&
      this.rows().some(
        (r) => r.id !== row.id && r.email.trim().toLowerCase() === raw.toLowerCase(),
      )
    ) {
      input.value = previous;
      this.toast.error('This email is already used on a deal.');
      return;
    }

    this.patchDealInline(row, { email: raw || '—' });
  }

  protected onDealMobileBlur(row: DealRow, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const raw = input.value.trim();
    const previous = this.dealMobileInputValue(row);
    if (raw === previous) return;
    this.patchDealInline(row, { mobile: raw || '—' });
  }

  private patchDealInline(row: DealRow, patch: Partial<DealRow>): void {
    const idn = Number(row.id);
    if (!Number.isFinite(idn)) return;

    this.dealsService
      .update(idn, { ...patch, lastModified: 'Just now' })
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.rows.update((rows) => rows.map((r) => (r.id === row.id ? updated : r)));
            const field =
              'email' in patch ? 'Email' : 'mobile' in patch ? 'Mobile' : 'Deal';
            this.toast.success(`${field} updated.`);
          } else {
            this.refreshDeals();
          }
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.resetCreateForm();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.resetCreateForm();
  }

  private defaultDealOwnerForForm(): string {
    return this.ownerOpts.defaultOwnerId();
  }

  protected dealOwnerDisplayLabel(): string {
    return this.ownerOpts.sessionOwnerDisplay().label;
  }

  private resolveDealOwnerIdForSubmit(rawOwnerId: string, editId: number | null): string {
    const row =
      editId != null ? this.rows().find((r) => Number(r.id) === editId) : undefined;
    const existing = row?.dealOwnerId ?? row?.assignedToUserId;
    return resolveRecordOwnerIdForSubmit({
      canAssign: this.canAssignDeals(),
      isAdminSession: this.isAdminViewer(),
      rawOwnerId,
      existingOwnerId: existing,
      sessionOwnerId: this.ownerOpts.sessionOwnerId(),
      fallbackOwnerId: this.ownerOpts.defaultOwnerId(),
    });
  }

  private resetCreateForm(): void {
    const defaultIndustry = this.dealMaster.industrySelectOptions()[0];
    const defaultEmployees = this.dealMaster.employeeSelectOptions()[0];
    this.createForm.reset({
      useExistingOrg: false,
      useExistingContact: false,
      organizationName: '',
      employees: defaultEmployees ? masterOptionFormValue(defaultEmployees) : '1-10',
      annualRevenue: '',
      website: '',
      gst: '',
      territory: '',
      industry: defaultIndustry ? masterOptionFormValue(defaultIndustry) : 'Technology',
      fullName: '',
      primaryMobile: '',
      primaryEmail: '',
      gender: '',
      status: masterSelectControlValue(
        undefined,
        DEFAULT_DEAL_PIPELINE_STATUS,
        this.dealMaster.statusSelectOptions(),
      ),
      dealOwner: this.defaultDealOwnerForForm(),
      requirement: '',
    });
    this.createForm.markAsUntouched();
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.dealsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        const ownerId = this.ownerOpts.resolveDealSelectValue(row);
        const revInput =
          row.annualRevenue != null && row.annualRevenue !== 0 ? String(row.annualRevenue) : '';
        const emailFromRow = row.email.trim() ? row.email : '';
        this.createForm.patchValue({
          organizationName: row.organizationName,
          employees: masterSelectControlValue(
            row.employeeCountId,
            row.employees,
            this.dealMaster.employeeSelectOptions(),
          ),
          annualRevenue: revInput,
          website: row.website,
          gst: normalizeGstin(row.gst),
          territory: masterSelectControlValue(
            row.territoryId,
            row.territory,
            this.dealMaster.territorySelectOptions(),
          ),
          industry: masterSelectControlValue(
            row.industryId,
            row.industry,
            this.dealMaster.industrySelectOptions(),
          ),
          primaryEmail: emailFromRow,
          primaryMobile: row.mobile,
          fullName: fullNameFromLeadParts(row) || '',
          gender: row.gender,
          status: resolveDealStatusSelectValue(
            row.dealStatusId,
            row.status,
            this.dealMaster.statusSelectOptions(),
          ),
          dealOwner: ownerId || this.ownerOpts.defaultOwnerId(),
          requirement: row.requirement ?? '',
        });
        this.formOpen.set(true);
      });
  }

  protected onBulkEdit(): void {
    const ids = this.sel.selectedItems();
    if (ids.length !== 1) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: ids[0] },
      queryParamsHandling: 'merge',
    });
    this.beginEditFromRoute(ids[0]);
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected onAssignToMenu(): void {
    if (!this.canManageDealAssignment()) return;
    this.assignPickerOpen.set(true);
  }

  protected onAssignClosed(): void {
    this.assignPickerOpen.set(false);
  }

  protected onAssignPicked(ownerKey: string): void {
    if (!this.canManageDealAssignment()) return;
    const opt = this.dealOwnerOptions().find((o) => o.id === ownerKey);
    if (!opt) {
      this.assignPickerOpen.set(false);
      return;
    }
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.dealsService
        .update(Number(sid), {
          assignedTo: opt.label,
          assignedInitials: opt.initials,
          dealOwnerId: opt.id,
          assignedToUserId: opt.id,
          lastModified: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe({
      next: () => {
        this.assignPickerOpen.set(false);
        this.sel.clear();
        this.refreshDeals();
        const n = ids.length;
        this.toast.success(
          n === 1 ? 'Deal owner assigned.' : `Deal owner assigned for ${n} deals.`,
        );
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected onClearAssignmentBulk(): void {
    if (!this.canManageDealAssignment()) return;
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.dealsService
        .update(Number(sid), {
          assignedTo: '',
          assignedInitials: '',
          dealOwnerId: '',
          assignedToUserId: '',
          lastModified: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe({
      next: () => {
        this.sel.clear();
        this.refreshDeals();
        const n = ids.length;
        this.toast.success(
          n === 1 ? 'Deal owner cleared.' : `Deal owner cleared for ${n} deals.`,
        );
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected clearEmailDuplicate(): void {
    const c = this.createForm.get('primaryEmail');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected readonly gstinErrorMessage = GSTIN_ERROR_MESSAGE;
  protected readonly gstinErrorKey = GSTIN_ERROR_KEY;

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected onGstinInput(ev: Event): void {
    syncGstinInputFromEvent(ev, this.createForm.controls.gst);
  }

  protected gstFieldInvalid(): boolean {
    return gstControlInvalid(this.createForm.controls.gst);
  }

  protected submitDeal(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const emailTrim = raw.primaryEmail.trim();
    const editId = this.editingNumericId();
    if (
      emailTrim &&
      this.rows().some(
        (r) =>
          r.email.toLowerCase() === emailTrim.toLowerCase() &&
          (editId == null || Number(r.id) !== editId),
      )
    ) {
      const c = this.createForm.get('primaryEmail');
      c?.setErrors({ ...(c.errors ?? {}), duplicate: true });
      c?.markAsTouched();
      return;
    }

    const ownerId = this.resolveDealOwnerIdForSubmit(raw.dealOwner, editId);
    const owner = this.dealOwnerOptions().find((o) => o.id === ownerId);
    const display = this.ownerOpts.sessionOwnerDisplay();
    const empPick = resolveOrgMasterPick(raw.employees, this.dealMaster.employeeSelectOptions());
    const terrPick = resolveOrgMasterPick(raw.territory, this.dealMaster.territorySelectOptions());
    const indPick = resolveOrgMasterPick(raw.industry, this.dealMaster.industrySelectOptions());
    const statPick = resolveOrgMasterPick(raw.status, this.dealMaster.statusSelectOptions());
    const { firstName, lastName } = splitFullName(raw.fullName);
    const payload: Omit<DealRow, 'id'> = {
      organizationName: raw.organizationName.trim(),
      employees: empPick.label.trim() || '1-10',
      employeeCountId: empPick.masterId,
      annualRevenue: parseRevenueInputToNumber(raw.annualRevenue),
      website: raw.website.trim(),
      gst: normalizeGstin(raw.gst),
      territory: terrPick.label.trim(),
      territoryId: terrPick.masterId,
      industry: indPick.label.trim() || 'Technology',
      industryId: indPick.masterId,
      salutation: '',
      salutationId: undefined,
      firstName,
      lastName,
      email: emailTrim,
      mobile: raw.primaryMobile.trim(),
      gender: raw.gender,
      status: resolveDealStatusLabel(statPick.label || raw.status),
      dealStatusId: statPick.masterId,
      dealOwnerId: ownerId,
      assignedToUserId: ownerId,
      assignedTo: owner?.label ?? display.label,
      assignedInitials: owner?.initials ?? display.initials,
      lastModified: 'Just now',
      probabilityPercent: 10,
      nextStep: '',
      requirement: raw.requirement.trim() || undefined,
    };

    const done = () => {
      this.sel.clear();
      this.refreshDeals();
      this.closeForm();
    };

    if (editId != null) {
      this.dealsService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Deal updated.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    } else {
      this.dealsService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Deal created.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    }
  }

  /** Table display only (not persisted). */
  protected formatDealRevenue(value: number): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '₹ 0';
    return `₹ ${value.toLocaleString('en-IN')}`;
  }

  protected statusClass(status: DealPipelineStatus): string {
    const kind = dealStatusCssKind(status);
    switch (kind) {
      case 'won':
        return 'deals__tag deals__tag--ok';
      case 'lost':
        return 'deals__tag deals__tag--bad';
      case 'demo':
        return 'deals__tag deals__tag--demo';
      case 'accent':
        return 'deals__tag deals__tag--accent';
      default:
        return 'deals__tag deals__tag--muted';
    }
  }

  protected setListView(view: 'table' | 'pipeline'): void {
    this.listView.set(view);
    if (view === 'table') {
      this.sel.clear();
    }
  }

  private rowMatchesStatusFilter(row: DealRow, filter: DealListStatusFilter): boolean {
    if (filter === 'all') return true;
    const filterLabel = resolveDealStatusLabel(filter);
    const opt = this.dealStatuses().find(
      (o) => resolveDealStatusLabel(o.name) === filterLabel || o.name === filter,
    );
    if (row.dealStatusId != null && row.dealStatusId > 0 && opt && opt.id > 0) {
      return row.dealStatusId === opt.id;
    }
    return resolveDealStatusLabel(row.status) === filterLabel;
  }

  private rowMatchesOwnerFilter(row: DealRow, ownerId: string): boolean {
    const rowOwnerId = row.dealOwnerId?.trim() || row.assignedToUserId?.trim();
    if (rowOwnerId && this.ownerIdsMatch(rowOwnerId, ownerId)) return true;
    const opt = this.ownerOpts.findById(ownerId);
    if (!opt) return false;
    const rowName = row.assignedTo.trim().toLowerCase();
    return rowName.length > 0 && rowName === opt.label.trim().toLowerCase();
  }

  private ownerIdsMatch(a: string, b: string): boolean {
    if (a === b) return true;
    const an = Number(a);
    const bn = Number(b);
    return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
  }

  protected dealDisplayTitle(row: DealRow): string {
    return row.dealTitle?.trim() || `${row.organizationName} — ${this.dealContactName(row)}`;
  }

  protected onPipelineStageChange(ev: {
    dealId: string;
    status: string;
    dealStatusId?: number | null;
  }): void {
    const idn = Number(ev.dealId);
    if (!Number.isFinite(idn) || idn <= 0) return;

    const status = resolveDealStatusLabel(ev.status);
    this.stageUpdatingId.set(ev.dealId);
    this.dealsService
      .updateStatus(idn, { status, dealStatusId: ev.dealStatusId ?? undefined })
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.stageUpdatingId.set(null);
          if (!updated) return;
          this.rows.update((rows) => rows.map((r) => (r.id === ev.dealId ? updated : r)));
          this.toast.success(`Stage updated to ${status}.`);
        },
        error: (e: unknown) => {
          this.stageUpdatingId.set(null);
          this.toast.error(leadsHttpErrorMessage(e));
        },
      });
  }

  private titleizeColumnId(id: string): string {
    return id
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}

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
import { LeadOwnerOptionsService } from '../../core/services/leads/lead-owner-options.service';
import { DealMasterSelectService } from '../../core/services/deals/deal-master-select.service';
import {
  masterOptionFormValue,
  masterSelectControlValue,
  resolveOrgMasterPick,
  resolveSalutationLabel,
} from '../../core/services/organizations/organization-master-select.util';
import { resolveDealStatusLabel, dealStatusCssKind } from '../../core/services/deals/deal-status.constants';
import type { DealPipelineStatus } from '../../core/services/deals/deal-pipeline.constants';
import { DEFAULT_DEAL_PIPELINE_STATUS } from '../../core/services/deals/deal-pipeline.constants';
import { CrmAssignPickerComponent } from '../../shared/components/crm-assign-picker/crm-assign-picker.component';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { DealPipelineBoardComponent } from './deal-pipeline-board.component';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import { optionalPhoneValidator, optionalUrlValidator } from '../../shared/validators/crm-validators';
import { createIdSelection } from '../../shared/utils/selection-manager';
import { leadPersonName } from '../../shared/utils/lead-person-name.util';

export type { DealPipelineStatus };

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
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly dealsService = inject(DealsService);
  private readonly toast = inject(ToastService);
  private readonly userScope = inject(UserDataScopeService);
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

  protected readonly dealStatuses = this.dealMaster.statusSelectOptions;

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  protected readonly dealOwnerOptions = this.ownerOpts.options;
  protected readonly masterOptionFormValue = masterOptionFormValue;
  protected readonly isAdminViewer = computed(() => this.userScope.isAdminSession());

  protected readonly rows = signal<DealRow[]>([]);
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
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
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
    territory: [''],
    industry: ['Technology', Validators.required],
    salutation: [''],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    primaryMobile: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
    primaryEmail: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
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
    this.sel.toggleSelectAll(this.rows().map((r) => r.id));
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

  private resetCreateForm(): void {
    const defaultIndustry = this.dealMaster.industrySelectOptions()[0];
    const defaultEmployees = this.dealMaster.employeeSelectOptions()[0];
    const defaultStatus = this.dealMaster.statusSelectOptions()[0];
    this.createForm.reset({
      useExistingOrg: false,
      useExistingContact: false,
      organizationName: '',
      employees: defaultEmployees ? masterOptionFormValue(defaultEmployees) : '1-10',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: defaultIndustry ? masterOptionFormValue(defaultIndustry) : 'Technology',
      salutation: '',
      lastName: '',
      primaryMobile: '',
      firstName: '',
      primaryEmail: '',
      gender: '',
      status: defaultStatus
        ? masterOptionFormValue(defaultStatus)
        : DEFAULT_DEAL_PIPELINE_STATUS,
      dealOwner: this.ownerOpts.defaultOwnerId(),
      requirement: '',
    });
    this.applyPrimaryEmailValidators('create');
    this.createForm.markAsUntouched();
  }

  /** Create always requires email; edit keeps legacy rows without email valid. */
  private applyPrimaryEmailValidators(mode: 'create' | 'edit-empty' | 'edit-filled'): void {
    const c = this.createForm.get('primaryEmail');
    if (!c) return;
    if (mode === 'create' || mode === 'edit-filled') {
      c.setValidators([Validators.required, Validators.email, Validators.maxLength(160)]);
    } else {
      c.setValidators([Validators.email, Validators.maxLength(160)]);
    }
    c.updateValueAndValidity({ emitEvent: false });
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
        this.applyPrimaryEmailValidators(emailFromRow.trim() ? 'edit-filled' : 'edit-empty');
        this.createForm.patchValue({
          organizationName: row.organizationName,
          employees: masterSelectControlValue(
            row.employeeCountId,
            row.employees,
            this.dealMaster.employeeSelectOptions(),
          ),
          annualRevenue: revInput,
          website: row.website,
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
          salutation: masterSelectControlValue(
            row.salutationId,
            row.salutation,
            this.dealMaster.salutationSelectOptions(),
          ),
          primaryEmail: emailFromRow,
          primaryMobile: row.mobile,
          firstName: row.firstName || 'Contact',
          lastName: row.lastName || 'Primary',
          gender: row.gender,
          status: masterSelectControlValue(
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
    if (!this.isAdminViewer()) return;
    this.assignPickerOpen.set(true);
  }

  protected onAssignClosed(): void {
    this.assignPickerOpen.set(false);
  }

  protected onAssignPicked(ownerKey: string): void {
    if (!this.isAdminViewer()) return;
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
    if (!this.isAdminViewer()) return;
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

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
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

    const owner = this.dealOwnerOptions().find((o) => o.id === raw.dealOwner);
    const salPick = resolveOrgMasterPick(raw.salutation, this.dealMaster.salutationSelectOptions());
    const empPick = resolveOrgMasterPick(raw.employees, this.dealMaster.employeeSelectOptions());
    const terrPick = resolveOrgMasterPick(raw.territory, this.dealMaster.territorySelectOptions());
    const indPick = resolveOrgMasterPick(raw.industry, this.dealMaster.industrySelectOptions());
    const statPick = resolveOrgMasterPick(raw.status, this.dealMaster.statusSelectOptions());
    const salLabel = resolveSalutationLabel(raw.salutation, this.dealMaster.salutationSelectOptions());

    const payload: Omit<DealRow, 'id'> = {
      organizationName: raw.organizationName.trim(),
      employees: empPick.label.trim() || '1-10',
      employeeCountId: empPick.masterId,
      annualRevenue: parseRevenueInputToNumber(raw.annualRevenue),
      website: raw.website.trim(),
      territory: terrPick.label.trim(),
      territoryId: terrPick.masterId,
      industry: indPick.label.trim() || 'Technology',
      industryId: indPick.masterId,
      salutation: salLabel,
      salutationId: salPick.masterId,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: emailTrim,
      mobile: raw.primaryMobile.trim(),
      gender: raw.gender,
      status: resolveDealStatusLabel(statPick.label || raw.status),
      dealStatusId: statPick.masterId,
      dealOwnerId: raw.dealOwner,
      assignedToUserId: raw.dealOwner,
      assignedTo: owner?.label ?? '',
      assignedInitials: owner?.initials ?? '',
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

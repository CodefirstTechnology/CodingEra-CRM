import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { concat, concatMap, defaultIfEmpty, forkJoin, of, last, take, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { DealsService } from '../../core/services/deals.service';
import { coerceLeadStatus } from '../../core/services/leads/lead-api.mapper';
import {
  FALLBACK_LEAD_STATUS_OPTIONS,
  resolveLeadStatusIdFromName,
} from '../../core/services/leads/lead-status.constants';
import {
  LeadMasterDataService,
  type MasterDataOption,
} from '../../core/services/leads/lead-master-data.service';
import {
  isPersistedApiLeadRow,
  LeadOwnerOptionsService,
} from '../../core/services/leads/lead-owner-options.service';
import { LeadRoundRobinService } from '../../core/services/leads/lead-round-robin.service';
import { LeadsService, leadsHttpErrorMessage } from '../../core/services/leads.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { ToastService } from '../../core/toast/toast.service';
import { CrmAssignPickerComponent } from '../../shared/components/crm-assign-picker/crm-assign-picker.component';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { mapLeadToDealRow } from '../../shared/utils/mappers';
import { CRM_PAGINATED_SELECT_PAGE_SIZE } from '../../shared/components/crm-paginated-select/crm-paginated-select.model';
import { CrmPaginationFooterComponent } from '../../shared/components/crm-pagination-footer/crm-pagination-footer.component';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import { createIdSelection } from '../../shared/utils/selection-manager';
import { optionalMobile10Validator, optionalUrlValidator } from '../../shared/validators/crm-validators';
import { environment } from '../../../environments/environment';
import {
  isIndiamartLeadRowId,
  mapIndiaMartLeadToLeadRow,
} from '../indiamartlead/indiamart-lead.mapper';
import { IndiamartLeadsService } from '../indiamartlead/indiamart-leads.service';
import {
  isJustdialLeadRowId,
  mapJustdialLeadToLeadRow,
} from '../justdiallead/justdial-lead.mapper';
import { JustdialLeadsService } from '../justdiallead/justdial-leads.service';
import {
  isTradeIndiaLeadRowId,
  mapTradeIndiaLeadToLeadRow,
} from '../tradeindialead/tradeindia-lead.mapper';
import { TradeIndiaLeadsService } from '../tradeindialead/tradeindia-leads.service';
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

const FALLBACK_SALUTATION_NAMES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;
const FALLBACK_EMPLOYEE_LABELS = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
const FALLBACK_TERRITORY_NAMES = ['India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;
const FALLBACK_REQUEST_TYPE_NAMES = ['Sales', 'Support', 'Partnership', 'General inquiry'] as const;
const FALLBACK_INDUSTRY_NAMES = [
  'Technology',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Education',
  'Other',
] as const;

const LEADS_TABLE_COLUMNS_STORAGE_PREFIX = 'crm.leadsTableColumns';
const DEFAULT_OPTIONAL_LEAD_COLUMN_IDS = ['status', 'owner'] as const;

interface LeadColumnOption {
  id: string;
  label: string;
  required: boolean;
}

@Component({
  selector: 'app-leads',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    CrmSelectionBarComponent,
    CrmAssignPickerComponent,
    CrmPaginationFooterComponent,
  ],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.scss',
})
export class LeadsComponent {
  /** Exposes feature flag for template (merged IndiaMART list). */
  protected readonly enableIndiamartLead = environment.enableIndiamartLead;
  protected readonly justdialEnabled = environment.justdial.enabled;
  protected readonly tradeindiaEnabled = environment.tradeindia.enabled;

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly leadsService = inject(LeadsService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly dealsService = inject(DealsService);
  private readonly leadMasterData = inject(LeadMasterDataService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);
  private readonly leadRoundRobin = inject(LeadRoundRobinService);
  private readonly indiamartLeadsService = inject(IndiamartLeadsService);
  /** Mirrors {@link IndiamartLeadsService.pullInProgress} for the sync button. */
  protected readonly indiamartPullLoading = this.indiamartLeadsService.pullInProgress;
  /** Set when live IndiaMART pull is misconfigured (e.g. missing CRM key in `.env`). */
  protected readonly indiamartConfigError = computed(() =>
    this.indiamartLeadsService.getLivePullConfigurationError(),
  );
  private readonly justdialLeadsService = inject(JustdialLeadsService);
  protected readonly justdialLoading = this.justdialLeadsService.loading;
  private readonly tradeindiaLeadsService = inject(TradeIndiaLeadsService);
  protected readonly tradeindiaLoading = this.tradeindiaLeadsService.loading;
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
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
  protected readonly columnMenuOpen = signal(false);
  protected readonly tablePage = signal(0);
  protected readonly tablePageSize = CRM_PAGINATED_SELECT_PAGE_SIZE;

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  private readonly salutationsFromApi = signal<MasterDataOption[]>([]);
  private readonly employeeCountsFromApi = signal<MasterDataOption[]>([]);
  private readonly territoriesFromApi = signal<MasterDataOption[]>([]);
  private readonly requestTypesFromApi = signal<MasterDataOption[]>([]);
  private readonly industriesFromApi = signal<MasterDataOption[]>([]);
  private readonly leadStatusesFromApi = signal<MasterDataOption[]>([]);

  /** Dropdown options: API rows when available, else legacy labels (`id` 0 → value is {@link MasterDataOption.name}). */
  protected readonly salutationSelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.salutationsFromApi();
    return api.length > 0 ? api : FALLBACK_SALUTATION_NAMES.map((name) => ({ id: 0, name }));
  });
  protected readonly employeeSelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.employeeCountsFromApi();
    return api.length > 0 ? api : FALLBACK_EMPLOYEE_LABELS.map((name) => ({ id: 0, name }));
  });
  protected readonly territorySelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.territoriesFromApi();
    return api.length > 0 ? api : FALLBACK_TERRITORY_NAMES.map((name) => ({ id: 0, name }));
  });
  protected readonly requestTypeSelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.requestTypesFromApi();
    return api.length > 0 ? api : FALLBACK_REQUEST_TYPE_NAMES.map((name) => ({ id: 0, name }));
  });
  protected readonly industrySelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.industriesFromApi();
    return api.length > 0 ? api : FALLBACK_INDUSTRY_NAMES.map((name) => ({ id: 0, name }));
  });
  protected readonly statusSelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.leadStatusesFromApi();
    return api.length > 0 ? api : [...FALLBACK_LEAD_STATUS_OPTIONS];
  });

  protected readonly leadOwnerOptions = this.leadOwnerOpts.options;
  protected readonly isPersistedApiLeadRow = isPersistedApiLeadRow;

  /** Status filter chips driven by `lead_statuses` master (same list as table dropdown). */
  protected readonly filterChips = computed(() => {
    const chips: { id: LeadListStatusFilter; label: string }[] = [{ id: 'all', label: 'All' }];
    for (const opt of this.statusSelectOptions()) {
      const label = opt.name.trim();
      if (!label) continue;
      chips.push({ id: coerceLeadStatus(label), label });
    }
    return chips;
  });

  protected readonly sourceFilterChips: { id: LeadListSourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'Manual', label: 'Manual' },
    { id: 'IndiaMART', label: 'IndiaMART' },
    { id: 'Justdial', label: 'Justdial' },
    { id: 'TradeIndia', label: 'TradeIndia' },
  ];

  private readonly requiredColumnIds = new Set(['name', 'source', 'requirement']);
  private readonly ignoredColumnIds = new Set([
    'id',
    'firstName',
    'lastName',
    'salutation',
    'gender',
    'leadOwnerName',
    'leadOwnerId',
    'leadSource',
    'sortTimestamp',
    'created',
  ]);
  private readonly preferredColumnOrder = [
    'name',
    'source',
    'requirement',
    'status',
    'owner',
    'organization',
    'email',
    'mobile',
    'industry',
    'updated',
    'employees',
    'annualRevenue',
    'website',
    'territory',
    'requestType',
    'notes',
  ];
  private readonly selectedColumnIds = signal<string[]>([...DEFAULT_OPTIONAL_LEAD_COLUMN_IDS]);
  private readonly columnLabels: Record<string, string> = {
    source: 'Source',
    owner: 'Lead owner',
    leadOwnerName: 'Lead owner',
    annualRevenue: 'Annual revenue',
    requestType: 'Request type',
  };

  /** Manual / API-backed rows only; merged with marketplace lead sources in {@link rows}. */
  protected readonly manualRows = signal<LeadRow[]>([]);

  constructor() {
    this.selectedColumnIds.set(this.loadStoredOptionalColumnIds());
    this.leadOwnerOpts.load();
    effect(() => {
      const max = this.tableTotalPages() - 1;
      if (this.tablePage() > max) this.tablePage.set(Math.max(0, max));
    });
    this.refreshLeads();
    forkJoin({
      salutations: this.leadMasterData.loadSalutations(),
      employeeCounts: this.leadMasterData.loadEmployeeCounts(),
      territories: this.leadMasterData.loadTerritories(),
      requestTypes: this.leadMasterData.loadRequestTypes(),
      industries: this.leadMasterData.loadIndustries(),
      leadStatuses: this.leadMasterData.loadLeadStatuses(),
    })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (r) => {
          this.salutationsFromApi.set(r.salutations);
          this.employeeCountsFromApi.set(r.employeeCounts);
          this.territoriesFromApi.set(r.territories);
          this.requestTypesFromApi.set(r.requestTypes);
          this.industriesFromApi.set(r.industries);
          this.leadStatusesFromApi.set(r.leadStatuses);
        },
      });
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
  }

  /** Unified list: manual CRM leads + marketplace sources, sorted by recency (scoped for User role). */
  protected readonly rows = computed(() =>
    this.userScope.filterLeads(this.leadOwnerOpts.enrichRows(this.buildMergedRows())),
  );

  /** Admins see lead status as read-only text in the table; users get dropdowns. */
  protected readonly isAdminViewer = computed(() => this.userScope.isAdminSession());

  private persistMarketplaceLeadsToDb(): boolean {
    const flag = (environment as { persistMarketplaceLeadsToDb?: boolean }).persistMarketplaceLeadsToDb;
    return flag !== false && !!environment.apiUrl?.trim();
  }

  private buildMergedRows(): LeadRow[] {
    const manual = this.manualRows().map((r) => {
      const leadSource: LeadSource =
        r.leadSource === 'IndiaMART' ||
        r.leadSource === 'Justdial' ||
        r.leadSource === 'TradeIndia'
          ? r.leadSource
          : 'Manual';
      const idNum = Number(r.id);
      return {
        ...r,
        leadSource,
        sortTimestamp: r.sortTimestamp ?? this.manualUpdatedSortKey(r.updated, idNum),
      };
    });

    if (this.persistMarketplaceLeadsToDb()) {
      return [...manual].sort((a, b) => (b.sortTimestamp ?? 0) - (a.sortTimestamp ?? 0));
    }

    const im = environment.enableIndiamartLead
      ? this.indiamartLeadsService.leads().map(mapIndiaMartLeadToLeadRow)
      : [];
    const jd = environment.justdial.enabled
      ? this.justdialLeadsService.leads().map(mapJustdialLeadToLeadRow)
      : [];
    const ti = environment.tradeindia.enabled
      ? this.tradeindiaLeadsService.leads().map(mapTradeIndiaLeadToLeadRow)
      : [];
    return [...manual, ...im, ...jd, ...ti].sort(
      (a, b) => (b.sortTimestamp ?? 0) - (a.sortTimestamp ?? 0),
    );
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
    this.userScope
      .listLeads()
      .pipe(take(1))
      .subscribe({
        next: (rows) => {
          this.manualRows.set(rows);
          this.leadRoundRobin.seedIndexFromExistingLeadCount(rows.length);
        },
        error: (err: unknown) => {
          this.manualRows.set([]);
          this.toast.show(leadsHttpErrorMessage(err));
        },
      });
  }

  protected readonly filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const st = this.statusFilter();
    const src = this.sourceFilter();
    return this.rows().filter((row) => {
      if (src !== 'all' && (row.leadSource ?? 'Manual') !== src) return false;
      if (st !== 'all' && !this.rowMatchesStatusFilter(row, st)) return false;
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
        (row.source?.toLowerCase().includes(q) ?? false) ||
        (row.requirement?.toLowerCase().includes(q) ?? false) ||
        (row.notes?.toLowerCase().includes(q) ?? false) ||
        srcLabel.includes(q)
      );
    });
  });

  protected readonly tableTotalPages = computed(() => {
    const n = this.filtered().length;
    return Math.max(1, Math.ceil(n / this.tablePageSize));
  });

  protected readonly paginatedFiltered = computed(() => {
    const all = this.filtered();
    const start = this.tablePage() * this.tablePageSize;
    return all.slice(start, start + this.tablePageSize);
  });

  protected setTablePage(page: number): void {
    const max = this.tableTotalPages() - 1;
    this.tablePage.set(Math.min(Math.max(0, page), max));
  }

  private resetTablePage(): void {
    this.tablePage.set(0);
  }

  protected readonly allSelectedFiltered = computed(() =>
    this.sel.allSelectedIn(this.filtered().map((r) => r.id)),
  );

  protected readonly columnOptions = computed<LeadColumnOption[]>(() => {
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
    if (!first) return this.leadOwnerOpts.defaultOwnerId();
    return (
      this.leadOwnerOpts.findById(first.leadOwnerId)?.id ??
      this.leadOwnerOptions().find(
        (o) => o.initials === first.owner || o.label === first.leadOwnerName,
      )?.id ??
      this.leadOwnerOpts.defaultOwnerId()
    );
  });

  protected readonly bulkCanEditSingleManual = computed(() => {
    if (this.sel.selectedCount() !== 1) return false;
    const id = this.sel.selectedItems()[0];
    return this.rows().find((r) => r.id === id)?.leadSource === 'Manual';
  });

  protected readonly bulkAssignEnabled = computed(() => {
    if (!this.isAdminViewer()) return false;
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return false;
    return ids.every((id) => isPersistedApiLeadRow(id));
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
    mobile: ['', [optionalMobile10Validator()]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    gender: [''],
    organization: ['', [Validators.required, Validators.maxLength(160)]],
    employees: [''],
    annualRevenue: ['', Validators.maxLength(32)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    territory: [''],
    industry: ['', Validators.required],
    status: ['', Validators.required],
    leadOwner: ['', Validators.required],
    requestType: [''],
    requirement: ['', [Validators.required, Validators.maxLength(240)]],
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
      employees: '',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: '',
      status: '',
      leadOwner: this.leadRoundRobin.nextOwnerIdForForm(),
      requestType: '',
      requirement: '',
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
      employees: '',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: '',
      status: '',
      leadOwner: this.leadRoundRobin.nextOwnerIdForForm(),
      requestType: '',
      requirement: '',
      customField: '',
    });
    this.createForm.markAsUntouched();
  }

  private beginEditFromRoute(idStr: string): void {
    if (isIndiamartLeadRowId(idStr)) return;
    if (isJustdialLeadRowId(idStr)) return;
    if (isTradeIndiaLeadRowId(idStr)) return;
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.leadsService
      .getById(id)
      .pipe(take(1))
      .subscribe({
        next: (row) => {
          if (!row) {
            this.toast.show('Lead not found.');
            return;
          }
          this.editingNumericId.set(id);
          this.modalLeadSource.set(row.leadSource ?? 'Manual');
          const ownerOpt =
            this.leadOwnerOpts.findById(row.leadOwnerId) ??
            this.leadOwnerOptions().find(
              (o) => o.initials === row.owner || o.label === row.leadOwnerName,
            );
          const ar = row.annualRevenue?.trim() ?? '';
          const arInput = ar.startsWith('₹') ? ar.replace(/^₹\s*/, '').trim() : ar;
          this.createForm.patchValue({
            salutation: this.masterSelectControlValue(row.salutationId, row.salutation, this.salutationSelectOptions()),
            lastName: row.lastName ?? '',
            mobile: (row.mobile ?? '').replace(/\D/g, '').slice(-10) || row.mobile || '',
            firstName: row.firstName ?? '',
            email: row.email ?? '',
            gender: row.gender ?? '',
            organization: row.organization ?? '',
            employees: this.masterSelectControlValue(
              row.employeeCountId,
              row.employees,
              this.employeeSelectOptions(),
            ),
            annualRevenue: arInput,
            website: row.website ?? '',
            territory: this.masterSelectControlValue(row.territoryId, row.territory, this.territorySelectOptions()),
            industry: this.masterSelectControlValue(row.industryId, row.industry, this.industrySelectOptions()),
            status: this.masterSelectControlValue(row.leadStatusId, row.status, this.statusSelectOptions()),
            leadOwner: ownerOpt?.id ?? row.leadOwnerId ?? this.leadOwnerOpts.defaultOwnerId(),
            requestType: this.masterSelectControlValue(
              row.requestTypeId,
              row.requestType,
              this.requestTypeSelectOptions(),
            ),
            requirement: row.requirement ?? '',
            customField: row.notes ?? '',
          });
          this.formOpen.set(true);
        },
        error: (err: unknown) => this.toast.show(leadsHttpErrorMessage(err)),
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
    const opt = this.leadOwnerOpts.findById(ownerKey);
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
          leadOwnerId: opt.id,
          leadOwnerName: opt.label,
          owner: opt.initials,
          updated: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe({
      next: () => {
        this.assignPickerOpen.set(false);
        this.sel.clear();
        this.refreshLeads();
      },
      error: (e: unknown) => this.toast.show(leadsHttpErrorMessage(e)),
    });
  }

  protected onClearAssignmentBulk(): void {
    if (!this.bulkAssignEnabled()) return;
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.leadsService
        .update(Number(sid), {
          leadOwnerId: '',
          leadOwnerName: '—',
          owner: '—',
          updated: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe({
      next: () => {
        this.sel.clear();
        this.refreshLeads();
      },
      error: (e: unknown) => this.toast.show(leadsHttpErrorMessage(e)),
    });
  }

  protected resolveOwnerSelectValue(row: LeadRow): string {
    return this.leadOwnerOpts.resolveSelectValue(row);
  }

  /** Read-only lead owner line in create/edit modal for non-admin users. */
  protected createFormLeadOwnerDisplay(): { initials: string; label: string } {
    const id = this.createForm.controls.leadOwner.value?.trim() ?? '';
    const opt = this.leadOwnerOpts.findById(id);
    return {
      initials: opt?.initials ?? '',
      label: opt?.label ?? '—',
    };
  }

  protected onLeadOwnerSelectChange(row: LeadRow, ownerKey: string): void {
    if (!this.isAdminViewer() || !isPersistedApiLeadRow(row.id)) return;
    const idn = Number(row.id);
    if (!Number.isFinite(idn)) return;

    const patch = !ownerKey
      ? { leadOwnerId: '', leadOwnerName: '—', owner: '—', updated: 'Just now' }
      : (() => {
          const opt = this.leadOwnerOpts.findById(ownerKey);
          if (!opt) return null;
          return {
            leadOwnerId: opt.id,
            leadOwnerName: opt.label,
            owner: opt.initials,
            updated: 'Just now',
          };
        })();

    if (!patch) return;

    this.patchLeadRowInList(String(idn), patch);

    this.leadsService
      .update(idn, patch)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.patchLeadRowInList(String(idn), updated);
          } else {
            this.refreshLeads();
          }
        },
        error: (e: unknown) => {
          this.refreshLeads();
          this.toast.show(leadsHttpErrorMessage(e));
        },
      });
  }

  private patchLeadRowInList(id: string, patch: Partial<LeadRow>): void {
    this.manualRows.update((rows) =>
      rows.map((r) => (r.id === id ? this.leadOwnerOpts.applyOwnerToRow({ ...r, ...patch }) : r)),
    );
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
      .subscribe({
        next: () => {
          this.sel.clear();
          this.refreshLeads();
          if (convertedCount > 0 && environment.showLeadConvertSuccessMessage) {
            window.alert('Lead converted to deal successfully');
          }
        },
        error: (e: unknown) => this.toast.show(leadsHttpErrorMessage(e)),
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
    this.resetTablePage();
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
    this.resetTablePage();
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.resetTablePage();
  }

  protected setStatusFilter(id: LeadListStatusFilter): void {
    this.statusFilter.set(id);
    this.resetTablePage();
  }

  protected setSourceFilter(id: LeadListSourceFilter): void {
    this.sourceFilter.set(id);
    this.resetTablePage();
  }

  protected toggleColumnMenu(): void {
    this.columnMenuOpen.update((open) => !open);
  }

  protected toggleColumn(id: string): void {
    if (this.requiredColumnIds.has(id)) return;
    const next = this.selectedColumnIds().includes(id)
      ? this.selectedColumnIds().filter((columnId) => columnId !== id)
      : [...this.selectedColumnIds(), id];
    this.saveOptionalColumnIds(next);
  }

  private leadsTableColumnsStorageKey(): string {
    const userId = this.auth.user()?.id?.trim();
    return userId
      ? `${LEADS_TABLE_COLUMNS_STORAGE_PREFIX}.${userId}`
      : LEADS_TABLE_COLUMNS_STORAGE_PREFIX;
  }

  private loadStoredOptionalColumnIds(): string[] {
    try {
      const raw = localStorage.getItem(this.leadsTableColumnsStorageKey());
      if (!raw?.trim()) return [...DEFAULT_OPTIONAL_LEAD_COLUMN_IDS];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_OPTIONAL_LEAD_COLUMN_IDS];
      const ids = parsed.filter((v): v is string => typeof v === 'string');
      return this.normalizeOptionalColumnIds(ids);
    } catch {
      return [...DEFAULT_OPTIONAL_LEAD_COLUMN_IDS];
    }
  }

  private normalizeOptionalColumnIds(ids: readonly string[]): string[] {
    const allowed = new Set(
      this.preferredColumnOrder.filter(
        (id) => !this.requiredColumnIds.has(id) && !this.ignoredColumnIds.has(id),
      ),
    );
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private saveOptionalColumnIds(ids: readonly string[]): void {
    const normalized = this.normalizeOptionalColumnIds(ids);
    this.selectedColumnIds.set(normalized);
    try {
      localStorage.setItem(this.leadsTableColumnsStorageKey(), JSON.stringify(normalized));
    } catch {
      /* quota / private browsing */
    }
  }

  protected isColumnVisible(id: string): boolean {
    return this.requiredColumnIds.has(id) || this.selectedColumnIds().includes(id);
  }

  /** Keeps +91-XXXXXXXXXX on one line in the table (no break after hyphen). */
  protected formatMobileCell(mobile: string | undefined): string {
    const t = mobile?.trim();
    if (!t || /^null$/i.test(t) || /^undefined$/i.test(t)) return '—';
    return t.replace(/\s+/g, ' ');
  }

  protected displayColumnValue(row: LeadRow, id: string): string {
    const value = (row as unknown as Record<string, unknown>)[id];
    if (value == null) return '—';
    if (typeof value === 'string') {
      const t = id === 'requirement' || id === 'notes' ? plainTextFromHtml(value) : value.trim();
      if (!t || /^null$/i.test(t) || /^undefined$/i.test(t)) return '—';
      return t;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '—';
  }

  protected isChipActive(id: LeadListStatusFilter): boolean {
    return this.statusFilter() === id;
  }

  protected isSourceChipActive(id: LeadListSourceFilter): boolean {
    return this.sourceFilter() === id;
  }

  /** Select `[value]` for master-backed dropdowns (`id` > 0 → numeric string, else label). */
  protected masterOptionFormValue(opt: MasterDataOption): string {
    return opt.id > 0 ? String(opt.id) : opt.name;
  }

  private masterSelectControlValue(
    id: number | null | undefined,
    label: string | null | undefined,
    options: MasterDataOption[],
  ): string {
    if (id != null && id > 0) return String(id);
    const name = label?.trim();
    if (!name) return '';
    const norm = (s: string) => s.trim().replace(/\.$/, '').toLowerCase();
    const key = norm(name);
    const byName = options.find((o) => o.id > 0 && norm(o.name) === key);
    if (byName) return String(byName.id);
    const legacy = options.find((o) => o.id === 0 && norm(o.name) === key);
    return legacy ? legacy.name : name;
  }

  private salutationLabelFromFormValue(value: string): string {
    const v = value.trim();
    if (!v) return '';
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      return this.salutationSelectOptions().find((o) => o.id === n)?.name ?? '';
    }
    return v;
  }

  private resolveMasterPick(
    rawValue: string,
    options: MasterDataOption[],
  ): { label: string; masterId?: number } {
    const v = rawValue.trim();
    if (!v) return { label: '' };
    const asNum = Number(v);
    if (Number.isFinite(asNum) && asNum > 0) {
      const opt = options.find((o) => o.id === asNum);
      return { label: opt?.name ?? '', masterId: asNum };
    }
    const norm = (s: string) => s.trim().toLowerCase();
    const key = norm(v);
    const byName = options.find((o) => norm(o.name) === key);
    if (byName != null) {
      if (byName.id > 0) {
        return { label: byName.name, masterId: byName.id };
      }
      return { label: byName.name };
    }
    return { label: v };
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

    let leadOwnerId = raw.leadOwner;
    if (!this.isAdminViewer() && editId != null) {
      const existing = this.rows().find((r) => Number(r.id) === editId);
      if (existing?.leadOwnerId) {
        leadOwnerId = existing.leadOwnerId;
      }
    }
    const ownerOpt = this.leadOwnerOpts.findById(leadOwnerId);
    const initials = ownerOpt?.initials ?? leadOwnerId;
    const leadOwnerName = ownerOpt?.label ?? leadOwnerId;

    const salPick = this.resolveMasterPick(raw.salutation, this.salutationSelectOptions());
    const empPick = this.resolveMasterPick(raw.employees, this.employeeSelectOptions());
    const terrPick = this.resolveMasterPick(raw.territory, this.territorySelectOptions());
    const rtPick = this.resolveMasterPick(raw.requestType, this.requestTypeSelectOptions());
    const indPick = this.resolveMasterPick(raw.industry, this.industrySelectOptions());
    const statPick = this.resolveMasterPick(raw.status, this.statusSelectOptions());
    const salLabel = salPick.label;

    const payload: Omit<LeadRow, 'id'> = {
      salutation: salLabel || undefined,
      salutationId: salPick.masterId,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      name: this.buildDisplayName(this.salutationLabelFromFormValue(raw.salutation), raw.firstName, raw.lastName),
      mobile: raw.mobile.trim(),
      leadOwnerId,
      gender: raw.gender || undefined,
      email: emailTrim,
      organization: raw.organization.trim(),
      employees: empPick.label || undefined,
      employeeCountId: empPick.masterId,
      annualRevenue: raw.annualRevenue.trim() || undefined,
      website: raw.website.trim() || undefined,
      territory: terrPick.label || undefined,
      territoryId: terrPick.masterId,
      industry: indPick.label || 'Other',
      industryId: indPick.masterId,
      status: coerceLeadStatus(statPick.label),
      leadStatusId:
        statPick.masterId ?? resolveLeadStatusIdFromName(statPick.label) ?? undefined,
      requestType: rtPick.label || undefined,
      requestTypeId: rtPick.masterId,
      requirement: raw.requirement.trim(),
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
        .subscribe({
          next: () => done(),
          error: (e: unknown) => this.toast.show(leadsHttpErrorMessage(e)),
        });
    } else {
      this.leadsService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => done(),
          error: (e: unknown) => this.toast.show(leadsHttpErrorMessage(e)),
        });
    }
  }

  protected canEditLeadStatusInTable(row: LeadRow): boolean {
    return !this.isAdminViewer() && isPersistedApiLeadRow(row.id);
  }

  /** Select value (master id string) — prefers {@link LeadRow.status} so it matches admin read-only text. */
  protected statusSelectValueForRow(row: LeadRow): string {
    const options = this.statusSelectOptions();
    const label = this.resolvedLeadStatusLabel(row);
    const norm = (s: string) => s.trim().toLowerCase();
    const key = norm(label);
    const byName = options.find((o) => o.id > 0 && norm(o.name) === key);
    if (byName) return String(byName.id);
    const legacy = options.find((o) => o.id === 0 && norm(o.name) === key);
    if (legacy) return legacy.name;
    if (row.leadStatusId != null && row.leadStatusId > 0) return String(row.leadStatusId);
    return label;
  }

  /** CRM master status label for display/filter; aligns with admin `row.status` column. */
  private resolvedLeadStatusLabel(row: LeadRow): string {
    const options = this.statusSelectOptions();
    const norm = (s: string) => s.trim().toLowerCase();
    let label = row.status?.trim() || '';
    if (label === 'Converted') label = 'Qualified';
    if (label === 'Lost') label = 'Unqualified';
    if (label) {
      const byName = options.find((o) => o.id > 0 && norm(o.name) === norm(label));
      if (byName?.name.trim()) return byName.name.trim();
    }
    if (row.leadStatusId != null && row.leadStatusId > 0) {
      const byId = options.find((o) => o.id === row.leadStatusId);
      if (byId?.name.trim()) return byId.name.trim();
    }
    return label || 'New';
  }

  /** Filter by `lead_status_id` when present; falls back to label match (incl. legacy Converted → Qualified). */
  private rowMatchesStatusFilter(row: LeadRow, filter: LeadListStatusFilter): boolean {
    if (filter === 'all') return true;
    const filterId = resolveLeadStatusIdFromName(filter);
    if (row.leadStatusId != null && row.leadStatusId > 0 && filterId != null) {
      return row.leadStatusId === filterId;
    }
    const display = this.resolvedLeadStatusLabel(row);
    return display === filter || coerceLeadStatus(display) === filter;
  }

  protected onLeadStatusChange(row: LeadRow, ev: Event): void {
    const raw = (ev.target as HTMLSelectElement).value;
    this.applyLeadStatusChange(row, raw);
  }

  protected onLeadStatusSelectModelChange(row: LeadRow, raw: string): void {
    this.applyLeadStatusChange(row, raw);
  }

  private applyLeadStatusChange(row: LeadRow, raw: string): void {
    const pick = this.resolveMasterPick(raw, this.statusSelectOptions());
    const label = pick.label.trim();
    if (!label) return;
    const leadStatusId =
      pick.masterId ?? resolveLeadStatusIdFromName(label) ?? row.leadStatusId ?? null;
    if (leadStatusId == null || leadStatusId <= 0) {
      this.toast.show('Could not resolve lead status. Check master data or API connection.');
      return;
    }
    const status = coerceLeadStatus(label);
    const idn = Number(row.id);
    if (!Number.isFinite(idn) || !isPersistedApiLeadRow(row.id)) return;
    this.leadsService
      .update(idn, {
        status,
        leadStatusId,
        updated: 'Just now',
      })
      .pipe(take(1))
      .subscribe({
        next: () => this.refreshLeads(),
        error: (e: unknown) => this.toast.show(leadsHttpErrorMessage(e)),
      });
  }

  private dbPersistToastSuffix(r: {
    dbSaved?: number;
    dbSkipped?: number;
    dbFailed?: number;
    lastError?: string;
  }): string {
    if (r.dbSaved == null && r.dbFailed == null) return '';
    const saved = r.dbSaved ?? 0;
    const failed = r.dbFailed ?? 0;
    const skipped = r.dbSkipped ?? 0;
    let msg = ` Database: ${saved} saved${skipped ? `, ${skipped} already in CRM` : ''}${failed ? `, ${failed} failed` : ''}.`;
    if (failed > 0 && r.lastError) {
      msg += ` ${r.lastError}`;
    }
    return msg;
  }

  /** Pulls IndiaMART leads from `environment.indiamart.pullApiUrl`. */
  protected syncIndiaMartFromApi(): void {
    this.indiamartLeadsService
      .fetchFromIndiaMartAPI()
      .pipe(take(1))
      .subscribe({
        next: (r) => {
          this.refreshLeads();
          this.toast.show(
            `IndiaMART sync: ${r.added} new locally, ${r.skippedDuplicates} skipped.${this.dbPersistToastSuffix(r)}`,
          );
        },
        error: (e: unknown) =>
          this.toast.show(e instanceof Error ? e.message : 'IndiaMART sync failed.'),
      });
  }

  /** Pulls Justdial leads from `environment.justdial.pullApiUrl`. */
  protected syncJustdialFromApi(): void {
    this.justdialLeadsService
      .fetchFromAPI()
      .pipe(take(1))
      .subscribe({
        next: (r) => {
          this.refreshLeads();
          this.toast.show(
            `Justdial sync: ${r.added} new locally, ${r.skippedDuplicates} skipped.${this.dbPersistToastSuffix(r)}`,
          );
        },
        error: (e: unknown) =>
          this.toast.show(e instanceof Error ? e.message : 'Justdial sync failed.'),
      });
  }

  /** Pulls TradeIndia leads from `environment.tradeindia.pullApiUrl`. */
  protected syncTradeIndiaFromApi(): void {
    this.tradeindiaLeadsService
      .fetchFromAPI()
      .pipe(take(1))
      .subscribe({
        next: (r) => {
          this.refreshLeads();
          this.toast.show(
            `TradeIndia sync: ${r.added} new locally, ${r.skippedDuplicates} skipped.${this.dbPersistToastSuffix(r)}`,
          );
        },
        error: (e: unknown) =>
          this.toast.show(e instanceof Error ? e.message : 'TradeIndia sync failed.'),
      });
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected statusClass(status: LeadStatus): string {
    switch (status) {
      case 'Qualified':
      case 'Converted':
        return 'leads__tag leads__tag--ok';
      case 'Contacted':
      case 'Nurture':
        return 'leads__tag leads__tag--accent';
      case 'Unqualified':
      case 'Junk':
      case 'Lost':
        return 'leads__tag leads__tag--bad';
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
    if (src === 'IndiaMART') return 'leads__tag leads__tag--src-im';
    if (src === 'Justdial') return 'leads__tag leads__tag--src-jd';
    if (src === 'TradeIndia') return 'leads__tag leads__tag--ok';
    return 'leads__tag leads__tag--src-manual';
  }

  protected hasActiveFilters(): boolean {
    return (
      this.statusFilter() !== 'all' ||
      this.sourceFilter() !== 'all' ||
      this.searchQuery().trim().length > 0
    );
  }

  private titleizeColumnId(id: string): string {
    return id
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}

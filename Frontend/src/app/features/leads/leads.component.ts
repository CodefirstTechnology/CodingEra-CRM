import { NgComponentOutlet, DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
  Type,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { concat, defaultIfEmpty, filter, forkJoin, last, map, Observable, startWith, take, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import {
  coerceLeadStatus,
  formatLeadDateDisplay,
  leadDateToFormInput,
  todayIsoDateLocal,
} from '../../core/services/leads/lead-api.mapper';
import {
  conversionLeadStatusDisplayName,
  ensureConvertedInLeadStatusOptions,
  FALLBACK_LEAD_STATUS_OPTIONS,
  findConversionLeadStatus,
  isConversionLeadStatusOption,
  isConvertedLeadStatusName,
  isSelectableLeadStatusOption,
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
import {
  composeLeadNotesForApi,
  resolveLeadRequirementForDisplay,
  resolveManualLeadCustomFieldForForm,
} from '../../core/services/leads/lead-notes-requirement.util';
import { LeadConversionStorageService } from '../../core/services/leads/lead-conversion-storage.service';
import { DealsService } from '../../core/services/deals.service';
import { LeadsService, leadsHttpErrorMessage } from '../../core/services/leads.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { PermissionService } from '../../core/services/permission.service';
import { resolveRecordOwnerIdForSubmit, showOwnerPickerOnCreate, showSelfAssignedOwnerOnCreate } from '../../shared/utils/record-owner-assignment.util';
import { TextFormatter } from '../../shared/utils/text-normalizer';
import { ToastService } from '../../core/toast/toast.service';
import { CrmAssignPickerComponent } from '../../shared/components/crm-assign-picker/crm-assign-picker.component';
import {
  buildLeadDealConversionIndex,
  isLeadConverted,
  isLeadQualifiedForConversion,
  type LeadDealConversionIndex,
} from '../../shared/utils/lead-conversion.util';
import type { ConvertLeadOptions } from '../../core/services/leads/lead-conversion.types';
import { ConvertLeadModalComponent } from '../../shared/components/convert-lead-modal/convert-lead-modal.component';
import type { LeadImportCommitResult } from './import/lead-import-api.models';
import { LeadExportModalComponent } from './export/lead-export-modal.component';
import type { LeadExportColumnOption, LeadExportRequest } from './export/lead-export.models';
import { CrmPaginationFooterComponent } from '../../shared/components/crm-pagination-footer/crm-pagination-footer.component';
import { createClientTablePagination } from '../../shared/utils/crm-table-pagination.util';
import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import { createIdSelection } from '../../shared/utils/selection-manager';
import {
  ColumnOrderHandleDirective,
  ColumnOrderItemDirective,
  ColumnOrderListDirective,
  ColumnOrderService,
  sortByColumnOrder,
  type ColumnOrderConfig,
  type ColumnReorderEvent,
} from '../../shared/table-column-order';
import {
  GSTIN_ERROR_KEY,
  GSTIN_ERROR_MESSAGE,
  gstControlInvalid,
  normalizeGstin,
  syncGstinInputFromEvent,
} from '../../shared/utils/gstin.util';
import { getCrmIntlTelInitOptions, crmIntlTelInputProps } from '../../shared/config/crm-intl-tel.config';
import { intlTelMobileErrorMessage, formatIntlTelDisplay } from '../../shared/utils/intl-tel.util';
import {
  gstFormValidators,
  optionalEmailValidator,
  optionalUrlValidator,
} from '../../shared/validators/crm-validators';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import { IntlTelInputComponent } from 'intl-tel-input/angularWithUtils';
import {
  buildLeadDisplayName,
  fullNameFromLeadParts,
  normalizeFullNameControl,
  splitFullName,
} from './lead-full-name.util';
import { environment } from '../../../environments/environment';
import { LeadSyncHttpService } from '../../core/services/lead-sync/lead-sync-http.service';
import type { LeadSyncMyAccess } from '../../core/services/lead-sync/lead-sync-api.models';
import {
  isIndiamartLeadRowId,
  isJustdialLeadRowId,
  isTradeIndiaLeadRowId,
} from './lead-marketplace-id.util';
import {
  hasAnyMarketplaceFeatureEnabled,
  loadLeadsMarketplaceRuntime,
  needsLocalMarketplaceMerge,
  type LeadsMarketplaceRuntime,
} from './leads-marketplace.runtime';
import type {
  LeadListOwnerFilter,
  LeadListSourceFilter,
  LeadListStatusFilter,
  LeadOwnerOption,
  LeadRow,
  LeadSource,
  LeadStatus,
} from './lead-row.model';

/** @deprecated Import from `./lead-row.model` instead. */
export type { LeadListStatusFilter as StatusFilter, LeadRow, LeadOwnerOption, LeadStatus } from './lead-row.model';

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
const LEADS_COLUMN_ORDER_STORAGE_PREFIX = 'crm.leadsColumnOrder';
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
    RouterOutlet,
    CrmAssignPickerComponent,
    CrmPaginationFooterComponent,
    ConvertLeadModalComponent,
    LeadExportModalComponent,
    NgComponentOutlet,
    IntlTelInputComponent,
    DatePipe,
    ColumnOrderListDirective,
    ColumnOrderItemDirective,
    ColumnOrderHandleDirective,
  ],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.scss',
  host: {
    '(document:click)': 'onDocumentClickCloseColumnMenu()',
  },
})
export class LeadsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly conversionStorage = inject(LeadConversionStorageService);
  private readonly userScope = inject(UserDataScopeService);
  protected readonly permissions = inject(PermissionService);
  private readonly leadMasterData = inject(LeadMasterDataService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);
  private readonly leadRoundRobin = inject(LeadRoundRobinService);
  private readonly leadSyncApi = inject(LeadSyncHttpService);
  private readonly injector = inject(Injector);
  private readonly columnOrderSvc = inject(ColumnOrderService);

  /** Assigned lead sync sources for the current user (from API). */
  protected readonly leadSyncAccess = signal<LeadSyncMyAccess[]>([]);

  /** Sources the user may sync when API is configured in admin settings. */
  protected readonly visibleSyncSources = computed(() =>
    this.leadSyncAccess().filter((s) => s.apiIntegrationReady),
  );

  private readonly syncingSourceIds = signal<Set<number>>(new Set());

  private readonly marketplaceRuntime = signal<LeadsMarketplaceRuntime | null>(null);
  private readonly marketplaceLocalRows = signal<LeadRow[]>([]);

  protected readonly indiamartPullLoading = computed(
    () => this.marketplaceRuntime()?.indiamart?.pullInProgress() ?? false,
  );
  protected readonly indiamartConfigError = computed(
    () => this.marketplaceRuntime()?.indiamart?.getConfigError() ?? null,
  );
  protected readonly justdialLoading = computed(
    () => this.marketplaceRuntime()?.justdial?.loading() ?? false,
  );
  protected readonly tradeindiaLoading = computed(
    () => this.marketplaceRuntime()?.tradeindia?.loading() ?? false,
  );
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly sel = createIdSelection();
  protected readonly assignPickerOpen = signal(false);
  /** When set, assign/clear apply to these ids instead of the checkbox selection. */
  private readonly assignTargetIds = signal<string[]>([]);
  protected readonly importModalOpen = signal(false);
  protected readonly importModalLazyComponent = signal<Type<unknown> | null>(null);
  protected readonly exportModalOpen = signal(false);
  protected readonly convertModalOpen = signal(false);
  protected readonly convertTargets = signal<LeadRow[]>([]);
  protected readonly openRowMenuId = signal<string | null>(null);
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);
  /** True when `/leads/:id` detail child route is active. */
  protected readonly detailChildActive = signal(false);
  /** Shown read-only in the lead modal (manual CRM flows only; IndiaMART rows never open this form). */
  protected readonly modalLeadSource = signal<LeadSource>('Manual');
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<LeadListStatusFilter>('all');
  protected readonly sourceFilter = signal<LeadListSourceFilter>('all');
  protected readonly ownerFilter = signal<LeadListOwnerFilter>('all');
  protected readonly columnMenuOpen = signal(false);

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  /** UI-only: set true to show Request type in create/edit modal (form control + API unchanged). */
  protected readonly showRequestTypeField = false;

  private readonly employeeCountsFromApi = signal<MasterDataOption[]>([]);
  private readonly territoriesFromApi = signal<MasterDataOption[]>([]);
  private readonly requestTypesFromApi = signal<MasterDataOption[]>([]);
  private readonly industriesFromApi = signal<MasterDataOption[]>([]);
  private readonly leadStatusesFromApi = signal<MasterDataOption[]>([]);

  /** Dropdown options: API rows when available, else legacy labels (`id` 0 → value is {@link MasterDataOption.name}). */
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
    const base = api.length > 0 ? api : [...FALLBACK_LEAD_STATUS_OPTIONS];
    return ensureConvertedInLeadStatusOptions(base);
  });

  /** Flagged (or legacy-named) conversion status from master data. */
  protected readonly conversionStatusOption = computed(() =>
    findConversionLeadStatus(this.statusSelectOptions()),
  );

  protected readonly conversionStatusLabel = computed(() =>
    conversionLeadStatusDisplayName(this.statusSelectOptions()),
  );

  protected readonly leadOwnerOptions = this.leadOwnerOpts.options;
  protected readonly isPersistedApiLeadRow = isPersistedApiLeadRow;
  protected readonly isLeadConverted = isLeadConverted;

  /** Status filter chips driven by `lead_statuses` master (same list as table dropdown). */
  protected readonly filterChips = computed(() => {
    const chips: { id: LeadListStatusFilter; label: string }[] = [{ id: 'all', label: 'All' }];
    for (const opt of this.statusSelectOptions()) {
      const label = opt.name.trim();
      if (!label || isConversionLeadStatusOption(opt)) continue;
      chips.push({ id: coerceLeadStatus(label), label });
    }
    return chips;
  });

  /**
   * Source filter options built dynamically from:
   * - Manual / Excel (always available CRM paths)
   * - Lead sync sources assigned to the user (API markerName = lead_source)
   * - Distinct `leadSource` values present in the current lead rows
   */
  protected readonly sourceFilterOptions = computed(() => {
    const byId = new Map<string, string>();
    byId.set('Manual', 'Manual');
    byId.set('Website', 'Website');
    byId.set('Excel', 'Excel');
    byId.set('IndiaMART', 'IndiaMART');
    byId.set('Justdial', 'Justdial');
    byId.set('TradeIndia', 'TradeIndia');

    for (const src of this.leadSyncAccess()) {
      const id = (src.markerName || src.displayName || src.code || '').trim();
      if (!id) continue;
      byId.set(id, src.displayName.trim() || id);
    }

    for (const row of this.rows()) {
      const id = (row.leadSource ?? '').trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, id);
    }

    const items: { id: LeadListSourceFilter; label: string }[] = [
      { id: 'all', label: 'All sources' },
    ];
    for (const [id, label] of byId) {
      items.push({ id, label });
    }
    return items;
  });

  protected readonly statusFilterOptions = computed(() => {
    const items: { id: LeadListStatusFilter; label: string }[] = [
      { id: 'all', label: 'All statuses' },
    ];
    for (const chip of this.filterChips()) {
      if (chip.id === 'all') continue;
      items.push(chip);
    }
    items.push({
      id: this.conversionStatusLabel() as LeadListStatusFilter,
      label: this.conversionStatusLabel(),
    });
    return items;
  });

  protected readonly ownerFilterOptions = computed(() => {
    const items: { id: LeadListOwnerFilter; label: string }[] = [
      { id: 'all', label: 'All owners' },
    ];
    for (const opt of this.leadOwnerOptions()) {
      items.push({ id: opt.id, label: opt.label });
    }
    return items;
  });

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
    'location',
    'leadDate',
    'requestType',
    'notes',
  ];
  private readonly selectedColumnIds = signal<string[]>([...DEFAULT_OPTIONAL_LEAD_COLUMN_IDS]);
  /** Full column id order (visible + hidden). Independent of visibility prefs. */
  private readonly columnOrderIds = signal<string[]>([]);
  private readonly columnLabels: Record<string, string> = {
    source: 'Source',
    owner: 'Lead owner',
    leadOwnerName: 'Lead owner',
    annualRevenue: 'Annual revenue',
    location: 'Location',
    leadDate: 'Lead date',
    requestType: 'Request type',
  };

  private readonly leadsColumnOrderConfig: ColumnOrderConfig = {
    storageKeyPrefix: LEADS_COLUMN_ORDER_STORAGE_PREFIX,
    preferredOrder: this.preferredColumnOrder,
    getUserId: () => this.auth.user()?.id ?? null,
  };

  /** Manual / API-backed rows only; merged with marketplace lead sources in {@link rows}. */
  protected readonly manualRows = signal<LeadRow[]>([]);
  /** Deal index for inferring converted leads without per-browser localStorage. */
  private readonly dealConversionIndex = signal<LeadDealConversionIndex | null>(null);

  constructor() {
    this.selectedColumnIds.set(this.loadStoredOptionalColumnIds());
    this.leadOwnerOpts.load();
    this.loadLeadSyncAccess();
    this.detailChildActive.set(!!this.route.firstChild);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map(() => !!this.route.firstChild),
        startWith(!!this.route.firstChild),
        takeUntilDestroyed(),
      )
      .subscribe((active) => this.detailChildActive.set(active));
    this.refreshLeads();
    this.refreshDealConversionIndex();
    effect(() => {
      const available = this.availableColumnIds();
      untracked(() => this.syncColumnOrderWithAvailable(available));
    });
    forkJoin({
      employeeCounts: this.leadMasterData.loadEmployeeCounts(),
      territories: this.leadMasterData.loadTerritories(),
      requestTypes: this.leadMasterData.loadRequestTypes(),
      industries: this.leadMasterData.loadIndustries(),
      leadStatuses: this.leadMasterData.loadLeadStatuses(),
    })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (r) => {
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

    effect(() => {
      const rt = this.marketplaceRuntime();
      if (!rt) return;
      rt.indiamart?.pullInProgress();
      rt.justdial?.loading();
      rt.tradeindia?.loading();
      untracked(() => this.refreshMarketplaceLocalRows());
    });

    effect(() => {
      const src = this.sourceFilter();
      if (src === 'IndiaMART' || src === 'Justdial' || src === 'TradeIndia') {
        untracked(() => void this.ensureMarketplaceRuntime());
      }
    });

    afterNextRender(() => {
      if (!needsLocalMarketplaceMerge()) return;
      const schedule =
        typeof requestIdleCallback === 'function'
          ? (cb: () => void) => requestIdleCallback(cb, { timeout: 4000 })
          : (cb: () => void) => setTimeout(cb, 1500);
      schedule(() => void this.ensureMarketplaceRuntime());
    });
  }

  private refreshMarketplaceLocalRows(): void {
    const rt = this.marketplaceRuntime();
    if (!rt) {
      this.marketplaceLocalRows.set([]);
      return;
    }
    const rows: LeadRow[] = [];
    if (rt.indiamart) rows.push(...rt.indiamart.getLocalLeadRows());
    if (rt.justdial) rows.push(...rt.justdial.getLocalLeadRows());
    if (rt.tradeindia) rows.push(...rt.tradeindia.getLocalLeadRows());
    this.marketplaceLocalRows.set(rows);
  }

  private ensureMarketplaceRuntime(): Promise<LeadsMarketplaceRuntime | null> {
    if (!hasAnyMarketplaceFeatureEnabled()) {
      return Promise.resolve(null);
    }
    return loadLeadsMarketplaceRuntime(this.injector).then((rt) => {
      this.marketplaceRuntime.set(rt);
      this.refreshMarketplaceLocalRows();
      return rt;
    });
  }

  /** Unified list: manual CRM leads + marketplace sources, sorted by recency (scoped for User role). */
  protected readonly rows = computed(() => {
    const index = this.dealConversionIndex();
    const enriched = this.conversionStorage.enrichLeadRows(
      this.leadOwnerOpts.enrichRows(this.buildMergedRows()),
    );
    const withDealConversion = index
      ? enriched.map((row) => this.conversionStorage.enrichLeadRowWithDeals(row, index))
      : enriched;
    return this.userScope.filterLeads(withDealConversion);
  });

  /** Admins see lead status as read-only text in the table; users get dropdowns. */
  protected readonly isAdminViewer = computed(() => this.userScope.isAdminSession());
  protected readonly canAssignLeads = computed(() => this.permissions.canAssignLeads());
  /** Bulk/inline reassignment — admin dashboard only. */
  protected readonly canManageLeadAssignment = computed(
    () => this.canAssignLeads() && this.isAdminViewer(),
  );
  /** Row menu assign — any user with leads.assign (e.g. Sales). */
  protected readonly canShowRowAssignActions = computed(() => this.canAssignLeads());
  protected readonly canSelfAssignLeads = computed(() => this.permissions.canSelfAssignLeads());
  protected readonly canDeleteLeads = computed(() => this.permissions.canDeleteLeads());
  protected readonly showLeadOwnerPicker = computed(() =>
    showOwnerPickerOnCreate(this.canAssignLeads(), this.isAdminViewer()),
  );
  protected readonly showSelfAssignedLeadOwner = computed(() =>
    showSelfAssignedOwnerOnCreate(this.canAssignLeads(), this.isAdminViewer()),
  );

  private persistMarketplaceLeadsToDb(): boolean {
    const flag = (environment as { persistMarketplaceLeadsToDb?: boolean }).persistMarketplaceLeadsToDb;
    return flag !== false && !!environment.apiUrl?.trim();
  }

  private buildMergedRows(): LeadRow[] {
    const manual = this.manualRows().map((r) => {
      const srcVal = (r.leadSource || r.source || '').trim();
      const lower = srcVal.toLowerCase();
      const leadSource: LeadSource =
        lower === 'indiamart'
          ? 'IndiaMART'
          : lower === 'justdial'
            ? 'Justdial'
            : lower === 'tradeindia'
              ? 'TradeIndia'
              : lower === 'website'
                ? 'Website'
                : lower === 'excel'
                  ? 'Excel'
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

    const marketplace = this.marketplaceLocalRows();
    return [...manual, ...marketplace].sort(
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
          this.toast.error(leadsHttpErrorMessage(err));
        },
      });
  }

  private refreshDealConversionIndex(): void {
    this.dealsService
      .getAll()
      .pipe(take(1))
      .subscribe({
        next: (deals) => this.dealConversionIndex.set(buildLeadDealConversionIndex(deals)),
        error: () => this.dealConversionIndex.set(null),
      });
  }

  protected readonly filtered = computed(() => {
    const q = TextFormatter.search(this.searchQuery());
    const st = this.statusFilter();
    const src = this.sourceFilter();
    const owner = this.ownerFilter();
    const filterByOwner = this.isAdminViewer() && owner !== 'all';
    return this.rows().filter((row) => {
      if (filterByOwner && !this.rowMatchesOwnerFilter(row, owner)) return false;
      if (src !== 'all' && (row.leadSource ?? 'Manual').toLowerCase() !== src.toLowerCase()) return false;
      if (st !== 'all' && !this.rowMatchesStatusFilter(row, st)) {
        return false;
      }
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

  protected readonly tablePagination = createClientTablePagination(this.filtered);

  protected readonly allSelectedFiltered = computed(() =>
    this.sel.allSelectedIn(this.filtered().map((r) => r.id)),
  );

  protected readonly availableColumnIds = computed(() => {
    const ids = new Set(this.preferredColumnOrder);
    for (const row of this.rows()) {
      for (const key of Object.keys(row)) {
        if (!this.ignoredColumnIds.has(key)) {
          ids.add(key);
        }
      }
    }
    return [...ids].filter((id) => !this.ignoredColumnIds.has(id));
  });

  protected readonly columnOptions = computed<LeadColumnOption[]>(() => {
    const options = this.availableColumnIds().map((id) => ({
      id,
      label: this.columnLabels[id] ?? this.titleizeColumnId(id),
      required: this.requiredColumnIds.has(id),
    }));
    const order = this.columnOrderIds();
    return order.length > 0 ? sortByColumnOrder(options, order) : options;
  });

  protected readonly visibleColumns = computed(() =>
    this.columnOptions().filter((column) => this.isColumnVisible(column.id)),
  );

  /** Column metadata for export modal (same ids/labels as the listing table). */
  protected readonly exportColumnOptions = computed<LeadExportColumnOption[]>(() =>
    this.columnOptions().map((c) => ({ key: c.id, label: c.label })),
  );

  protected readonly exportDefaultSelectedKeys = computed(() =>
    this.visibleColumns().map((c) => c.id),
  );

  /** Active listing filters forwarded to export (same shape as list API). */
  protected readonly exportListFilters = computed((): Omit<
    LeadExportRequest,
    'columns' | 'datePreset' | 'fromDate' | 'toDate'
  > => {
    const filters: Omit<LeadExportRequest, 'columns' | 'datePreset' | 'fromDate' | 'toDate'> = {};
    const search = TextFormatter.search(this.searchQuery());
    if (search) filters.search = search;

    const src = this.sourceFilter();
    if (src !== 'all') filters.leadSource = src;

    const st = this.statusFilter();
    if (st !== 'all') filters.status = st;

    if (this.isAdminViewer()) {
      const owner = this.ownerFilter();
      if (owner !== 'all') {
        const ownerId = Number(owner);
        if (Number.isFinite(ownerId) && ownerId > 0) {
          filters.leadOwnerId = ownerId;
        }
      }
    }

    return filters;
  });

  protected readonly assignDefaultOwnerId = computed(() => {
    const ids = this.assignIdsForAction();
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

  protected readonly bulkCanEditSingle = computed(() => {
    if (this.isAdminViewer() || this.sel.selectedCount() !== 1) return false;
    const id = this.sel.selectedItems()[0];
    const row = this.rows().find((r) => r.id === id);
    return !!row && this.canEditLead(row);
  });

  protected readonly bulkAssignEnabled = computed(() => {
    if (!this.canManageLeadAssignment()) return false;
    return this.canAssignIds(this.sel.selectedItems());
  });

  protected canAssignLead(row: LeadRow): boolean {
    return this.canShowRowAssignActions() && isPersistedApiLeadRow(row.id);
  }

  private assignIdsForAction(): string[] {
    const rowIds = this.assignTargetIds();
    return rowIds.length > 0 ? rowIds : this.sel.selectedItems();
  }

  private canAssignIds(ids: string[]): boolean {
    return ids.length > 0 && ids.every((id) => isPersistedApiLeadRow(id));
  }

  private canApplyAssignment(ids: string[]): boolean {
    if (!this.canAssignIds(ids)) return false;
    return this.assignTargetIds().length > 0
      ? this.canShowRowAssignActions()
      : this.canManageLeadAssignment();
  }

  protected readonly bulkConvertEnabled = computed(() => {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const r = this.rows().find((x) => x.id === id);
      return !!r && this.canConvertLead(r);
    });
  });

  protected readonly convertModalPreview = computed(() => {
    const targets = this.convertTargets();
    if (targets.length === 1) return targets[0].name;
    return targets
      .slice(0, 3)
      .map((t) => t.name)
      .join(', ')
      .concat(targets.length > 3 ? ` +${targets.length - 3} more` : '');
  });

  /** User-only: persisted CRM leads that are not converted. */
  protected canEditLead(row: LeadRow): boolean {
    return (
      !this.isAdminViewer() &&
      isPersistedApiLeadRow(row.id) &&
      !this.isLeadConvertedInTable(row)
    );
  }

  protected canConvertLead(row: LeadRow): boolean {
    return (
      this.canEditLead(row) &&
      isLeadQualifiedForConversion(row, this.resolvedLeadStatusLabel(row))
    );
  }

  /** User may see Convert in the menu but it stays disabled until status is Qualified. */
  protected showConvertLeadDisabled(row: LeadRow): boolean {
    return this.canEditLead(row) && !this.canConvertLead(row);
  }

  protected canDeleteLead(row: LeadRow): boolean {
    return this.canDeleteLeads() && isPersistedApiLeadRow(row.id);
  }

  protected readonly createForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    mobile: [''],
    email: ['', [Validators.maxLength(160), optionalEmailValidator()]],
    gender: [''],
    organization: ['', [Validators.required, Validators.maxLength(160)]],
    employees: [''],
    annualRevenue: ['', Validators.maxLength(32)],
    dealAmount: ['', Validators.maxLength(40)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    gst: ['', gstFormValidators()],
    territory: [''],
    industry: ['', Validators.required],
    source: ['Manual', Validators.required],
    status: ['', Validators.required],
    leadOwner: ['', Validators.required],
    requestType: [''],
    requirement: ['', [Validators.required, Validators.maxLength(240)]],
    customField: ['', Validators.maxLength(240)],
    location: ['', Validators.maxLength(240)],
    leadDate: [todayIsoDateLocal()],
  });

  private clearEditQuery(): void {
    this.lastRouteEdit = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Stable fn refs — NgComponentOutlet output maps must not be recreated every CD cycle. */
  private readonly importModalRequestClose = (): void => this.closeImportModal();

  private readonly importModalRequestImportCompleted = (value: unknown): void =>
    this.onLeadsImportCompleted(value as LeadImportCommitResult);

  protected openImportModal(): void {
    this.importModalOpen.set(true);
    if (!this.importModalLazyComponent()) {
      void import('./leads-import-modal-lazy.component').then((m) => {
        this.importModalLazyComponent.set(m.LeadsImportModalLazyComponent);
      });
    }
  }

  protected openExportModal(): void {
    this.exportModalOpen.set(true);
  }

  protected closeExportModal(): void {
    this.exportModalOpen.set(false);
  }

  protected importModalOutletInputs(): Record<string, unknown> {
    return {
      open: this.importModalOpen(),
      requestClose: this.importModalRequestClose,
      requestImportCompleted: this.importModalRequestImportCompleted,
    };
  }

  protected closeImportModal(): void {
    this.importModalOpen.set(false);
  }

  protected onLeadsImportCompleted(result: LeadImportCommitResult): void {
    if (result.importedCount > 0) {
      this.refreshLeads();
    }
  }

  /** Admins with assign pick/rotate; user-dashboard create self-assigns (legacy production). */
  private defaultLeadOwnerForForm(): string {
    if (showOwnerPickerOnCreate(this.canAssignLeads(), this.isAdminViewer())) {
      return this.leadRoundRobin.nextOwnerIdForForm();
    }
    return this.leadOwnerOpts.defaultOwnerId();
  }

  private resolveLeadOwnerIdForSubmit(rawOwnerId: string, editId: number | null): string {
    const existing =
      editId != null ? this.rows().find((r) => Number(r.id) === editId)?.leadOwnerId : undefined;
    return resolveRecordOwnerIdForSubmit({
      canAssign: this.canAssignLeads(),
      isAdminSession: this.isAdminViewer(),
      rawOwnerId,
      existingOwnerId: existing,
      sessionOwnerId: this.leadOwnerOpts.sessionOwnerId(),
      fallbackOwnerId: this.leadOwnerOpts.defaultOwnerId(),
    });
  }

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.modalLeadSource.set('Manual');
    this.clearEditQuery();
    this.createForm.reset({
      fullName: '',
      mobile: '',
      email: '',
      gender: '',
      organization: '',
      employees: '',
      annualRevenue: '',
      dealAmount: '',
      website: '',
      gst: '',
      territory: '',
      industry: '',
      source: 'Manual',
      status: '',
      leadOwner: this.defaultLeadOwnerForForm(),
      requestType: '',
      requirement: '',
      customField: '',
      location: '',
      leadDate: todayIsoDateLocal(),
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
      fullName: '',
      mobile: '',
      email: '',
      gender: '',
      organization: '',
      employees: '',
      annualRevenue: '',
      dealAmount: '',
      website: '',
      gst: '',
      territory: '',
      industry: '',
      source: 'Manual',
      status: '',
      leadOwner: this.defaultLeadOwnerForForm(),
      requestType: '',
      requirement: '',
      customField: '',
      location: '',
      leadDate: todayIsoDateLocal(),
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
            this.toast.error('Lead not found.');
            return;
          }
          if (this.isLeadConvertedInTable(row)) {
            this.toast.error('Leads moved to a deal cannot be edited.');
            this.clearEditQuery();
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
          const dealAmountInput =
            row.dealAmount != null && row.dealAmount !== 0 ? String(row.dealAmount) : '';
          this.createForm.patchValue({
            fullName: fullNameFromLeadParts(row),
            mobile: row.mobile ?? '',
            email: row.email ?? '',
            gender: row.gender ?? '',
            organization: row.organization ?? '',
            employees: this.masterSelectControlValue(
              row.employeeCountId,
              row.employees,
              this.employeeSelectOptions(),
            ),
            annualRevenue: arInput,
            dealAmount: dealAmountInput,
            website: row.website ?? '',
            gst: normalizeGstin(row.gst),
            territory: this.masterSelectControlValue(row.territoryId, row.territory, this.territorySelectOptions()),
            industry: this.masterSelectControlValue(row.industryId, row.industry, this.industrySelectOptions()),
            source: row.source || row.leadSource || 'Manual',
            status: this.masterSelectControlValue(row.leadStatusId, row.status, this.statusSelectOptions()),
            leadOwner: ownerOpt?.id ?? row.leadOwnerId ?? this.leadOwnerOpts.defaultOwnerId(),
            requestType: this.masterSelectControlValue(
              row.requestTypeId,
              row.requestType,
              this.requestTypeSelectOptions(),
            ),
            requirement: resolveLeadRequirementForDisplay(row.requirement, row.notes),
            customField: resolveManualLeadCustomFieldForForm(row.requirement, row.notes),
            location: row.location ?? '',
            leadDate: leadDateToFormInput(row.leadDate) || todayIsoDateLocal(),
          });
          this.formOpen.set(true);
        },
        error: (err: unknown) => this.toast.error(leadsHttpErrorMessage(err)),
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
    if (!this.bulkCanEditSingle()) return;
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
    this.openAssignPickerFor([]);
  }

  private openAssignPickerFor(rowIds: string[]): void {
    const open = () => {
      this.assignTargetIds.set(rowIds);
      this.assignPickerOpen.set(true);
    };
    if (this.leadOwnerOpts.loaded() && this.leadOwnerOptions().length > 0) {
      open();
      return;
    }
    this.leadOwnerOpts.reload();
    this.leadOwnerOpts.ensureLoaded().pipe(take(1)).subscribe(() => open());
  }

  protected onAssignClosed(): void {
    this.assignPickerOpen.set(false);
    this.assignTargetIds.set([]);
  }

  protected onRowAssignTo(row: LeadRow, ev?: Event): void {
    ev?.stopPropagation();
    this.closeRowMenus();
    if (!this.canAssignLead(row)) return;
    this.openAssignPickerFor([row.id]);
  }

  protected onRowClearAssignment(row: LeadRow, ev?: Event): void {
    ev?.stopPropagation();
    this.closeRowMenus();
    if (!this.canAssignLead(row)) return;
    this.assignTargetIds.set([row.id]);
    this.applyClearAssignment([row.id]);
    this.assignTargetIds.set([]);
  }

  protected onAssignPicked(ownerKey: string): void {
    const opt = this.leadOwnerOpts.findById(ownerKey);
    if (!opt) {
      this.onAssignClosed();
      return;
    }
    const ids = this.assignIdsForAction();
    if (!this.canApplyAssignment(ids)) {
      this.onAssignClosed();
      return;
    }
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
        const n = ids.length;
        this.onAssignClosed();
        this.sel.clear();
        this.refreshLeads();
        this.toast.success(
          n === 1 ? 'Lead owner assigned.' : `Lead owner assigned for ${n} leads.`,
        );
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected onClearAssignmentBulk(): void {
    if (!this.bulkAssignEnabled()) return;
    this.applyClearAssignment(this.sel.selectedItems());
  }

  private applyClearAssignment(ids: string[]): void {
    if (!this.canApplyAssignment(ids)) return;
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
        this.assignTargetIds.set([]);
        this.refreshLeads();
        const n = ids.length;
        this.toast.success(
          n === 1 ? 'Lead owner cleared.' : `Lead owner cleared for ${n} leads.`,
        );
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected resolveOwnerSelectValue(row: LeadRow): string {
    return this.leadOwnerOpts.resolveSelectValue(row);
  }

  /** Read-only lead owner line in create/edit modal for self-assign users. */
  protected createFormLeadOwnerDisplay(): { initials: string; label: string } {
    const display = this.leadOwnerOpts.sessionOwnerDisplay();
    const id = this.createForm.controls.leadOwner.value?.trim() ?? '';
    const opt = id ? this.leadOwnerOpts.findById(id) : undefined;
    if (opt) {
      return { initials: opt.initials, label: opt.label };
    }
    return { initials: display.initials, label: display.label };
  }

  protected onLeadOwnerSelectChange(row: LeadRow, ownerKey: string): void {
    if (!this.canManageLeadAssignment() || !isPersistedApiLeadRow(row.id)) return;
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
          const label = patch.leadOwnerName?.trim();
          if (!label || label === '—') {
            this.toast.success('Lead owner cleared.');
          } else {
            this.toast.success(`Lead owner changed to ${label}.`);
          }
        },
        error: (e: unknown) => {
          this.refreshLeads();
          this.toast.error(leadsHttpErrorMessage(e));
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
    const leads = this.sel
      .selectedItems()
      .map((id) => this.rows().find((r) => r.id === id))
      .filter((r): r is LeadRow => !!r && this.canConvertLead(r));
    if (leads.length === 0) return;
    this.openConvertModal(leads);
  }

  protected onRowEdit(row: LeadRow, ev?: Event): void {
    ev?.stopPropagation();
    this.closeRowMenus();
    if (!this.canEditLead(row)) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: row.id },
      queryParamsHandling: 'merge',
    });
    this.beginEditFromRoute(row.id);
  }

  protected openConvertModalForRow(row: LeadRow, ev?: Event): void {
    ev?.stopPropagation();
    this.openRowMenuId.set(null);
    if (!this.canConvertLead(row)) return;
    this.openConvertModal([row]);
  }

  protected deleteLead(row: LeadRow, ev?: Event): void {
    ev?.stopPropagation();
    this.closeRowMenus();
    if (!this.canDeleteLead(row)) {
      this.toast.error('You do not have permission to perform this action.');
      return;
    }
    const idn = Number(row.id);
    if (!Number.isFinite(idn)) return;
    if (!confirm('Delete this lead? This action cannot be undone.')) return;
    this.leadsService
      .delete(idn)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.sel.removeId(row.id);
          this.manualRows.update((rows) => rows.filter((r) => r.id !== row.id));
          this.toast.success('Lead deleted.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected openConvertModal(leads: LeadRow[]): void {
    this.convertTargets.set(leads);
    this.convertModalOpen.set(true);
  }

  protected closeConvertModal(): void {
    this.convertModalOpen.set(false);
    this.convertTargets.set([]);
  }

  protected onConvertModalConfirm(options: ConvertLeadOptions): void {
    const targets = [...this.convertTargets()];
    this.closeConvertModal();
    if (targets.length === 0) return;

    const streams = targets.map((lead) =>
      this.leadsService.convertToDeal(lead.id, options).pipe(
        take(1),
        tap((result) => {
          this.createRowBus.publish('deal', result.deal);
          this.applyLeadConversionToList(lead.id, result);
        }),
      ),
    );

    concat(...streams)
      .pipe(last(), defaultIfEmpty(null))
      .subscribe({
        next: () => {
          this.refreshDealConversionIndex();
          this.sel.clear();
          this.toast.success(
            targets.length === 1
              ? 'Lead converted to deal successfully'
              : `${targets.length} leads converted to deals successfully`,
          );
        },
        error: (e: unknown) => {
          this.refreshLeads();
          this.toast.error(leadsHttpErrorMessage(e));
        },
      });
  }

  private applyLeadConversionToList(leadId: string, result: { lead: LeadRow | null }): void {
    if (result.lead == null) {
      this.manualRows.update((rows) => rows.filter((r) => r.id !== leadId));
      return;
    }
    this.manualRows.update((rows) =>
      rows.map((r) => (r.id === leadId ? this.leadOwnerOpts.applyOwnerToRow({ ...r, ...result.lead! }) : r)),
    );
  }

  protected toggleRowMenu(rowId: string, ev: Event): void {
    ev.stopPropagation();
    this.openRowMenuId.update((cur) => (cur === rowId ? null : rowId));
  }

  protected closeRowMenus(): void {
    this.openRowMenuId.set(null);
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
    this.ownerFilter.set('all');
    this.tablePagination.resetPage();
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
    this.tablePagination.resetPage();
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.tablePagination.resetPage();
  }

  protected setStatusFilter(id: LeadListStatusFilter): void {
    this.statusFilter.set(id);
    this.tablePagination.resetPage();
  }

  protected setSourceFilter(id: LeadListSourceFilter): void {
    this.sourceFilter.set(id);
    this.tablePagination.resetPage();
  }

  protected onStatusFilterSelect(ev: Event): void {
    this.setStatusFilter((ev.target as HTMLSelectElement).value as LeadListStatusFilter);
  }

  protected onSourceFilterSelect(ev: Event): void {
    this.setSourceFilter((ev.target as HTMLSelectElement).value as LeadListSourceFilter);
  }

  protected setOwnerFilter(id: LeadListOwnerFilter): void {
    this.ownerFilter.set(id);
    this.tablePagination.resetPage();
  }

  protected onOwnerFilterSelect(ev: Event): void {
    this.setOwnerFilter((ev.target as HTMLSelectElement).value as LeadListOwnerFilter);
  }

  protected toggleColumnMenu(): void {
    this.columnMenuOpen.update((open) => !open);
  }

  /** Closes Columns menu on outside click (inside clicks are stopped on the menu root). */
  protected onDocumentClickCloseColumnMenu(): void {
    if (this.columnMenuOpen()) {
      this.columnMenuOpen.set(false);
    }
  }

  protected toggleColumn(id: string): void {
    if (this.requiredColumnIds.has(id)) return;
    const next = this.selectedColumnIds().includes(id)
      ? this.selectedColumnIds().filter((columnId) => columnId !== id)
      : [...this.selectedColumnIds(), id];
    this.saveOptionalColumnIds(next);
  }

  protected onColumnReordered(event: ColumnReorderEvent): void {
    const current = this.columnOrderIds();
    if (!current.length) return;
    const next = this.columnOrderSvc.applyReorder(
      this.leadsColumnOrderConfig,
      current,
      event.fromIndex,
      event.toIndex,
    );
    this.columnOrderIds.set(next);
  }

  protected resetColumnOrder(): void {
    const next = this.columnOrderSvc.resetOrder(
      this.leadsColumnOrderConfig,
      this.availableColumnIds(),
    );
    this.columnOrderIds.set(next);
  }

  private syncColumnOrderWithAvailable(available: readonly string[]): void {
    const current = this.columnOrderIds();
    const next = this.columnOrderSvc.reconcileOrder(
      this.leadsColumnOrderConfig,
      available,
      current,
    );
    if (next !== current) {
      this.columnOrderIds.set(next);
    }
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

  /** Keeps international mobile on one line with a space after the country code. */
  protected formatMobileCell(mobile: string | undefined): string {
    return formatIntlTelDisplay(mobile);
  }

  protected displayColumnValue(row: LeadRow, id: string): string {
    const value = (row as unknown as Record<string, unknown>)[id];
    if (value == null) return '—';
    if (typeof value === 'string') {
      let t: string;
      if (id === 'requirement') {
        const src = row.leadSource ?? 'Manual';
        t =
          src === 'IndiaMART' || src === 'Justdial' || src === 'TradeIndia'
            ? plainTextFromHtml(value)
            : resolveLeadRequirementForDisplay(row.requirement, row.notes);
      } else if (id === 'notes') {
        t = plainTextFromHtml(value);
      } else {
        t = value.trim();
      }
      if (!t || /^null$/i.test(t) || /^undefined$/i.test(t)) return '—';
      return t;
    }
    if (id === 'leadDate') {
      return formatLeadDateDisplay(String(value));
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '—';
  }

  /** Select `[value]` for master-backed dropdowns (`id` > 0 → numeric string, else label). */
  protected masterOptionFormValue(opt: MasterDataOption): string {
    return opt.id > 0 ? String(opt.id) : opt.name;
  }

  protected isLeadStatusSelectable(opt: MasterDataOption): boolean {
    return isSelectableLeadStatusOption(opt);
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

  protected submitLead(): void {
    TextFormatter.form(this.createForm);
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

    const leadOwnerId = this.resolveLeadOwnerIdForSubmit(raw.leadOwner, editId);
    const ownerOpt = this.leadOwnerOpts.findById(leadOwnerId);
    const initials = ownerOpt?.initials ?? leadOwnerId;
    const leadOwnerName = ownerOpt?.label ?? leadOwnerId;

    const empPick = this.resolveMasterPick(raw.employees, this.employeeSelectOptions());
    const terrPick = this.resolveMasterPick(raw.territory, this.territorySelectOptions());
    const rtPick = this.resolveMasterPick(raw.requestType, this.requestTypeSelectOptions());
    const indPick = this.resolveMasterPick(raw.industry, this.industrySelectOptions());
    const statPick = this.resolveMasterPick(raw.status, this.statusSelectOptions());
    if (isConversionLeadStatusOption({ id: 0, name: statPick.label })) {
      this.toast.error(
        `${this.conversionStatusLabel()} is set automatically when you convert a lead to a deal.`,
      );
      return;
    }
    const { firstName, lastName } = splitFullName(raw.fullName);

    const payload: Omit<LeadRow, 'id'> = {
      salutation: undefined,
      salutationId: undefined,
      firstName,
      lastName,
      name:
        TextFormatter.entityName(
          'lead',
          buildLeadDisplayName('', firstName, lastName) || raw.fullName,
        ) || firstName,
      mobile: raw.mobile.trim(),
      leadOwnerId,
      gender: raw.gender || undefined,
      email: emailTrim,
      organization: raw.organization.trim(),
      employees: empPick.label || undefined,
      employeeCountId: empPick.masterId,
      annualRevenue: raw.annualRevenue.trim() || undefined,
      dealAmount: parseRevenueInputToNumber(raw.dealAmount),
      website: raw.website.trim() || undefined,
      gst: normalizeGstin(raw.gst) || undefined,
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
      notes: composeLeadNotesForApi(raw.requirement, raw.customField) || undefined,
      location: raw.location.trim() || undefined,
      leadDate: raw.leadDate.trim() || todayIsoDateLocal(),
      leadOwnerName,
      owner: initials,
      updated: 'Just now',
      leadSource: (raw.source as LeadSource) || 'Manual',
      source: raw.source || 'Manual',
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
          next: () => {
            this.toast.success('Lead updated.');
            this.createRowBus.publish('lead', { ...payload, id: String(editId) });
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    } else {
      this.leadsService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Lead created.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    }
  }

  protected canEditLeadStatusInTable(row: LeadRow): boolean {
    return (
      !this.isAdminViewer() &&
      isPersistedApiLeadRow(row.id) &&
      !this.isLeadConvertedInTable(row)
    );
  }

  /** Applies conversion metadata before status is rendered in the table. */
  protected leadRowForTableStatus(row: LeadRow): LeadRow {
    return this.conversionStorage.enrichLeadRowWithDeals(row, this.dealConversionIndex());
  }

  protected isLeadConvertedInTable(row: LeadRow): boolean {
    const enriched = this.leadRowForTableStatus(row);
    const conv = this.conversionStatusOption();
    return isLeadConverted(enriched, {
      id: conv?.id,
      name: conv?.name,
    });
  }

  /** Master-data status label for table display (admin read-only and filters). */
  protected leadStatusLabel(row: LeadRow): LeadStatus {
    return coerceLeadStatus(this.resolvedLeadStatusLabel(row));
  }

  /** Status label shown in the table — matches user dropdown / converted badge rules. */
  protected leadTableStatusLabel(row: LeadRow): LeadStatus {
    const enriched = this.leadRowForTableStatus(row);
    const conv = this.conversionStatusOption();
    // Only force conversion master name when FK/status is actually conversion —
    // not when a soft deal match exists on a Qualified (or other) lead.
    if (conv?.id != null && conv.id > 0 && enriched.leadStatusId === conv.id) {
      return (conv.name.trim() || this.conversionStatusLabel()) as LeadStatus;
    }
    if (
      isConvertedLeadStatusName(enriched.status ?? '') ||
      (conv?.name?.trim() &&
        enriched.status?.trim().toLowerCase() === conv.name.trim().toLowerCase())
    ) {
      return this.conversionStatusLabel() as LeadStatus;
    }
    return this.leadStatusLabel(enriched);
  }

  /** Select value (master id string) — prefers {@link LeadRow.status} so it matches admin read-only text. */
  protected statusSelectValueForRow(row: LeadRow): string {
    const options = this.statusSelectOptions();
    const label = this.resolvedLeadStatusLabel(this.leadRowForTableStatus(row));
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
    if (isConversionLeadStatusOption({ id: 0, name: label })) {
      const conversionOpt = options.find((o) => isConversionLeadStatusOption(o) && o.id > 0);
      if (conversionOpt?.name.trim()) return conversionOpt.name.trim();
      // Legacy overlay: conversion status was UI-only while FK stayed Qualified.
      label = 'Qualified';
    }
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

  /** Filter by `lead_status_id` when present; falls back to label match (incl. legacy Converted). */
  private rowMatchesStatusFilter(row: LeadRow, filter: LeadListStatusFilter): boolean {
    if (filter === 'all') return true;
    const enriched = this.leadRowForTableStatus(row);
    const conv = this.conversionStatusOption();
    if (
      isConvertedLeadStatusName(filter) ||
      (conv != null && filter.trim().toLowerCase() === conv.name.trim().toLowerCase())
    ) {
      return isLeadConverted(enriched, { id: conv?.id, name: conv?.name });
    }
    const filterId = resolveLeadStatusIdFromName(filter);
    if (enriched.leadStatusId != null && enriched.leadStatusId > 0 && filterId != null) {
      return enriched.leadStatusId === filterId;
    }
    const display = this.resolvedLeadStatusLabel(enriched);
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
    if (isConversionLeadStatusOption({ id: pick.masterId ?? 0, name: label })) {
      this.toast.error(
        `${this.conversionStatusLabel()} is set automatically when you convert a lead to a deal.`,
      );
      this.refreshLeads();
      return;
    }
    const leadStatusId =
      pick.masterId ?? resolveLeadStatusIdFromName(label) ?? row.leadStatusId ?? null;
    if (leadStatusId == null || leadStatusId <= 0) {
      this.toast.error('Could not resolve lead status. Check master data or API connection.');
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
        next: () => {
          this.refreshLeads();
          this.toast.success(`Lead status updated to ${label}.`);
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
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

  protected syncSourceLoading(code: string): boolean {
    const access = this.leadSyncAccess().find((s) => s.code.trim().toLowerCase() === code.trim().toLowerCase());
    return access ? this.syncingSourceIds().has(access.sourceId) : false;
  }

  protected syncSourceConfigError(code: string): string | null {
    const access = this.leadSyncAccess().find((s) => s.code.trim().toLowerCase() === code.trim().toLowerCase());
    if (!access) return null;
    if (!access.apiIntegrationReady) {
      return `Ask an admin to connect ${access.displayName} in Advanced Settings → Lead Sync.`;
    }
    return null;
  }

  private loadLeadSyncAccess(): void {
    this.leadSyncApi.listMyAccess().pipe(take(1)).subscribe({
      next: (rows) => this.leadSyncAccess.set(rows),
      error: () => this.leadSyncAccess.set([]),
    });
  }

  protected syncMarketplaceSource(access: LeadSyncMyAccess): void {
    if (!access.apiIntegrationReady) {
      this.toast.error(
        `${access.displayName} is not connected yet. Ask an admin to add the API key in Advanced Settings.`,
      );
      return;
    }

    this.syncingSourceIds.update((set) => new Set(set).add(access.sourceId));
    this.leadSyncApi
      .runSync(access.sourceId)
      .pipe(take(1))
      .subscribe({
        next: (r) => {
          this.syncingSourceIds.update((set) => {
            const next = new Set(set);
            next.delete(access.sourceId);
            return next;
          });
          this.refreshLeads();
          this.loadLeadSyncAccess();
          if (r.errorMessage || r.status === 'Failed') {
            this.toast.error(r.errorMessage ?? `${access.displayName} sync failed.`);
            return;
          }
          this.toast.success(
            `${access.displayName}: ${r.totalCreated} new lead(s) imported (${r.totalReceived} received from API).`,
          );
        },
        error: (e: unknown) => {
          this.syncingSourceIds.update((set) => {
            const next = new Set(set);
            next.delete(access.sourceId);
            return next;
          });
          const msg = e instanceof Error ? e.message : `${access.displayName} sync failed.`;
          this.toast.error(msg);
        },
      });
  }

  private fetchMarketplaceByCode(rt: LeadsMarketplaceRuntime | null, code: string) {
    const c = code.trim().toLowerCase();
    if (c === 'indiamart') return rt?.indiamart?.fetchFromApi();
    if (c === 'justdial') return rt?.justdial?.fetchFromApi();
    if (c === 'tradeindia') return rt?.tradeindia?.fetchFromApi();
    return undefined;
  }

  protected readonly gstinErrorMessage = GSTIN_ERROR_MESSAGE;
  protected readonly gstinErrorKey = GSTIN_ERROR_KEY;
  protected readonly intlTelInitOptions = getCrmIntlTelInitOptions();
  protected readonly intlTelMobileInputProps = crmIntlTelInputProps();
  protected intlTelMobileError = intlTelMobileErrorMessage;

  protected onFullNameBlur(): void {
    normalizeFullNameControl(this.createForm.controls.fullName);
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected gstFieldInvalid(): boolean {
    return gstControlInvalid(this.createForm.controls.gst);
  }

  protected onGstinInput(ev: Event): void {
    syncGstinInputFromEvent(ev, this.createForm.controls.gst);
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
        if (isConversionLeadStatusOption({ id: 0, name: status })) {
          return 'leads__tag leads__tag--ok';
        }
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
    if (src === 'Excel') return 'leads__tag leads__tag--src-excel';
    return 'leads__tag leads__tag--src-manual';
  }

  protected hasActiveFilters(): boolean {
    return (
      this.statusFilter() !== 'all' ||
      this.sourceFilter() !== 'all' ||
      (this.isAdminViewer() && this.ownerFilter() !== 'all') ||
      this.searchQuery().trim().length > 0
    );
  }

  private rowMatchesOwnerFilter(row: LeadRow, ownerId: string): boolean {
    const rowOwnerId = row.leadOwnerId?.trim();
    if (rowOwnerId && this.ownerIdsMatch(rowOwnerId, ownerId)) return true;
    const opt = this.leadOwnerOpts.findById(ownerId);
    if (!opt) return false;
    const rowName = row.leadOwnerName.trim().toLowerCase();
    return rowName.length > 0 && rowName === opt.label.trim().toLowerCase();
  }

  private ownerIdsMatch(a: string, b: string): boolean {
    if (a === b) return true;
    const an = Number(a);
    const bn = Number(b);
    return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
  }

  private titleizeColumnId(id: string): string {
    return id
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}

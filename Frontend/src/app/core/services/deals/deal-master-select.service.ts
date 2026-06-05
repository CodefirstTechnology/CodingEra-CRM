import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  labelsToMasterOptions,
  mergeApiOrFallback,
  ORG_EMPLOYEE_FALLBACK_LABELS,
  ORG_INDUSTRY_FALLBACK_LABELS,
  ORG_TERRITORY_FALLBACK_LABELS,
  SALUTATION_FALLBACK_LABELS,
  salutationSelectOptions as buildSalutationSelectOptions,
} from '../organizations/organization-master-select.util';
import { LeadMasterDataService, type MasterDataOption } from '../leads/lead-master-data.service';
import { FALLBACK_DEAL_STATUS_OPTIONS } from './deal-status.constants';

const INDUSTRY_FALLBACK = labelsToMasterOptions([...ORG_INDUSTRY_FALLBACK_LABELS]);
const EMPLOYEE_FALLBACK = labelsToMasterOptions([...ORG_EMPLOYEE_FALLBACK_LABELS]);

const territoryWithBlank = (middle: MasterDataOption[]): MasterDataOption[] => [
  { id: 0, name: '' },
  ...middle,
];

const SALUTATION_FALLBACK = labelsToMasterOptions([...SALUTATION_FALLBACK_LABELS]);

/**
 * Loads MasterData for deal forms:
 * salutations, employee-counts, territories, industries, deal-statuses.
 */
@Injectable({ providedIn: 'root' })
export class DealMasterSelectService {
  private readonly master = inject(LeadMasterDataService);

  private readonly salutations = signal<MasterDataOption[]>(SALUTATION_FALLBACK);
  private readonly employees = signal<MasterDataOption[]>(EMPLOYEE_FALLBACK);
  private readonly territories = signal<MasterDataOption[]>(
    territoryWithBlank(labelsToMasterOptions([...ORG_TERRITORY_FALLBACK_LABELS])),
  );
  private readonly industries = signal<MasterDataOption[]>(INDUSTRY_FALLBACK);
  private readonly statuses = signal<MasterDataOption[]>([...FALLBACK_DEAL_STATUS_OPTIONS]);
  private statusesReady$?: Observable<readonly MasterDataOption[]>;

  readonly salutationSelectOptions = computed(() =>
    buildSalutationSelectOptions(this.salutations()),
  );
  readonly employeeSelectOptions = computed(() => this.employees());
  readonly territorySelectOptions = computed(() => this.territories());
  readonly industrySelectOptions = computed(() => this.industries());
  readonly statusSelectOptions = computed(() => this.statuses());

  /** Resolves when deal-status master data is loaded (needed before POST /api/deals). */
  ensureStatusesLoaded(): Observable<readonly MasterDataOption[]> {
    if (this.statusesReady$) {
      return this.statusesReady$;
    }

    const base = environment.apiUrl?.trim();
    if (!base) {
      this.statusesReady$ = of([...FALLBACK_DEAL_STATUS_OPTIONS]);
      return this.statusesReady$;
    }

    this.statusesReady$ = forkJoin({
      salutations: this.master.loadSalutations(),
      employees: this.master.loadEmployeeCounts(),
      territories: this.master.loadTerritories(),
      industries: this.master.loadIndustries(),
      statuses: this.master.loadDealStatuses(),
    }).pipe(
      tap(({ salutations, employees, territories, industries, statuses }) => {
        this.salutations.set(buildSalutationSelectOptions(salutations));
        this.employees.set(mergeApiOrFallback(employees, EMPLOYEE_FALLBACK));
        const tMid = territories.length
          ? territories
          : labelsToMasterOptions([...ORG_TERRITORY_FALLBACK_LABELS]);
        this.territories.set(territoryWithBlank(tMid));
        this.industries.set(mergeApiOrFallback(industries, INDUSTRY_FALLBACK));
        this.statuses.set(
          statuses.length ? mergeApiOrFallback(statuses, [...FALLBACK_DEAL_STATUS_OPTIONS]) : [...FALLBACK_DEAL_STATUS_OPTIONS],
        );
      }),
      map(() => this.statuses()),
      catchError(() => {
        this.statuses.set([...FALLBACK_DEAL_STATUS_OPTIONS]);
        return of([...FALLBACK_DEAL_STATUS_OPTIONS] as readonly MasterDataOption[]);
      }),
      shareReplay(1),
    );
    return this.statusesReady$;
  }

}

import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  labelsToMasterOptions,
  mergeApiOrFallback,
  ORG_EMPLOYEE_FALLBACK_LABELS,
  ORG_INDUSTRY_FALLBACK_LABELS,
  ORG_TERRITORY_FALLBACK_LABELS,
  salutationSelectOptions,
} from '../organizations/organization-master-select.util';
import { LeadMasterDataService, type MasterDataOption } from '../leads/lead-master-data.service';
import { FALLBACK_DEAL_STATUS_OPTIONS } from './deal-status.constants';

const INDUSTRY_FALLBACK = labelsToMasterOptions([...ORG_INDUSTRY_FALLBACK_LABELS]);
const EMPLOYEE_FALLBACK = labelsToMasterOptions([...ORG_EMPLOYEE_FALLBACK_LABELS]);

const territoryWithBlank = (middle: MasterDataOption[]): MasterDataOption[] => [
  { id: 0, name: '' },
  ...middle,
];

/**
 * Loads MasterData for deal forms:
 * salutations, employee-counts, territories, industries.
 * Deal statuses use local pipeline fallback (no MasterData endpoint yet).
 */
@Injectable({ providedIn: 'root' })
export class DealMasterSelectService {
  private readonly master = inject(LeadMasterDataService);

  private readonly salutations = signal<MasterDataOption[]>([]);
  private readonly employees = signal<MasterDataOption[]>(EMPLOYEE_FALLBACK);
  private readonly territories = signal<MasterDataOption[]>(
    territoryWithBlank(labelsToMasterOptions([...ORG_TERRITORY_FALLBACK_LABELS])),
  );
  private readonly industries = signal<MasterDataOption[]>(INDUSTRY_FALLBACK);
  private readonly statuses = signal<MasterDataOption[]>([...FALLBACK_DEAL_STATUS_OPTIONS]);

  readonly salutationSelectOptions = computed(() => salutationSelectOptions(this.salutations()));
  readonly employeeSelectOptions = computed(() => this.employees());
  readonly territorySelectOptions = computed(() => this.territories());
  readonly industrySelectOptions = computed(() => this.industries());
  readonly statusSelectOptions = computed(() => this.statuses());

  constructor() {
    const base = environment.apiUrl?.trim();
    if (!base) return;

    forkJoin({
      salutations: this.master.loadSalutations(),
      employees: this.master.loadEmployeeCounts(),
      territories: this.master.loadTerritories(),
      industries: this.master.loadIndustries(),
    })
      .pipe(
        take(1),
        catchError(() =>
          of({
            salutations: [] as MasterDataOption[],
            employees: [],
            territories: [],
            industries: [],
          }),
        ),
      )
      .subscribe(({ salutations, employees, territories, industries }) => {
        this.salutations.set(salutations);
        this.employees.set(mergeApiOrFallback(employees, EMPLOYEE_FALLBACK));
        const tMid = territories.length
          ? territories
          : labelsToMasterOptions([...ORG_TERRITORY_FALLBACK_LABELS]);
        this.territories.set(territoryWithBlank(tMid));
        this.industries.set(mergeApiOrFallback(industries, INDUSTRY_FALLBACK));
      });
  }
}

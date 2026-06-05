import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, take, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  labelsToMasterOptions,
  mergeApiOrFallback,
  ORG_EMPLOYEE_FALLBACK_LABELS,
  ORG_INDUSTRY_FALLBACK_LABELS,
  ORG_TERRITORY_FALLBACK_LABELS,
} from './organization-master-select.util';
import { LeadMasterDataService, type MasterDataOption } from '../leads/lead-master-data.service';

const INDUSTRY_FALLBACK = labelsToMasterOptions([...ORG_INDUSTRY_FALLBACK_LABELS]);
const EMPLOYEE_FALLBACK = labelsToMasterOptions([...ORG_EMPLOYEE_FALLBACK_LABELS]);

/** Territory: optional blank row + fallback region labels when API empty. */
const territoryWithBlank = (middle: MasterDataOption[]): MasterDataOption[] => [
  { id: 0, name: '' },
  ...middle,
];

/**
 * Loads `/api/MasterData/industries`, `employee-counts`, `territories` for organization forms.
 * Reuses cached observables from {@link LeadMasterDataService}.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationMasterSelectService {
  private readonly master = inject(LeadMasterDataService);

  private readonly industries = signal<MasterDataOption[]>(INDUSTRY_FALLBACK);
  private readonly employees = signal<MasterDataOption[]>(EMPLOYEE_FALLBACK);
  private readonly territories = signal<MasterDataOption[]>(
    territoryWithBlank(labelsToMasterOptions([...ORG_TERRITORY_FALLBACK_LABELS])),
  );

  readonly industrySelectOptions = computed(() => this.industries());
  readonly employeeSelectOptions = computed(() => this.employees());
  readonly territorySelectOptions = computed(() => this.territories());

  private ready$?: Observable<void>;

  /** Loads org form master data on first use (not at app shell startup). */
  ensureLoaded(): Observable<void> {
    if (this.ready$) {
      return this.ready$;
    }
    const base = environment.apiUrl?.trim();
    if (!base) {
      this.ready$ = of(undefined);
      return this.ready$;
    }

    this.ready$ = forkJoin({
      industries: this.master.loadIndustries(),
      employees: this.master.loadEmployeeCounts(),
      territories: this.master.loadTerritories(),
    }).pipe(
      catchError(() => of({ industries: [] as MasterDataOption[], employees: [], territories: [] })),
      take(1),
      tap(({ industries, employees, territories }) => {
        this.industries.set(mergeApiOrFallback(industries, INDUSTRY_FALLBACK));
        this.employees.set(mergeApiOrFallback(employees, EMPLOYEE_FALLBACK));
        const tMid = territories.length
          ? territories
          : labelsToMasterOptions([...ORG_TERRITORY_FALLBACK_LABELS]);
        this.territories.set(territoryWithBlank(tMid));
      }),
      map(() => undefined),
      shareReplay(1),
    );
    return this.ready$;
  }
}

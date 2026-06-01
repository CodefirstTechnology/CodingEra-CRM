import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { OrganizationRow } from '../../../features/organizations/organizations.component';
import type {
  DealQuotationPrefill,
  QuotationMasterSelectOptions,
} from '../../../shared/utils/deal-quotation-prefill.util';
import {
  buildDealQuotationPrefill,
  prefillToFormPatch,
} from '../../../shared/utils/deal-quotation-prefill.util';
import { DealMasterSelectService } from '../deals/deal-master-select.service';
import { DealsService } from '../deals.service';
import { OrganizationHttpService } from '../organizations/organization-http.service';

@Injectable({ providedIn: 'root' })
export class QuotationDealPrefillService {
  private readonly deals = inject(DealsService);
  private readonly orgHttp = inject(OrganizationHttpService);
  private readonly dealMaster = inject(DealMasterSelectService);

  resolveFormPatch(
    cached: DealQuotationPrefill | null,
    dealIdFromQuery: number | null,
  ): Observable<Record<string, unknown> | null> {
    return this.dealMaster.ensureStatusesLoaded().pipe(
      switchMap(() => {
        const masters = this.masterOptions();
        if (cached) {
          return this.enrichPrefill(cached).pipe(
            map((p) => prefillToFormPatch(p, masters)),
          );
        }
        if (dealIdFromQuery == null || dealIdFromQuery <= 0) {
          return of(null);
        }
        return this.deals.getById(dealIdFromQuery).pipe(
          switchMap((row) => {
            if (!row) return of(null);
            const prefill = buildDealQuotationPrefill(dealIdFromQuery, row);
            return this.enrichPrefill(prefill).pipe(
              map((p) => prefillToFormPatch(p, masters)),
            );
          }),
        );
      }),
    );
  }

  private masterOptions(): QuotationMasterSelectOptions {
    return {
      salutations: this.dealMaster.salutationSelectOptions(),
      employees: this.dealMaster.employeeSelectOptions(),
      territories: this.dealMaster.territorySelectOptions(),
      industries: this.dealMaster.industrySelectOptions(),
    };
  }

  private enrichPrefill(prefill: DealQuotationPrefill): Observable<DealQuotationPrefill> {
    const orgId = prefill.organizationId;
    if (orgId == null || orgId <= 0) {
      return of(prefill);
    }
    return this.orgHttp.getById(orgId).pipe(
      map((org) => this.mergeOrganization(prefill, org)),
      catchError(() => of(prefill)),
    );
  }

  private mergeOrganization(
    prefill: DealQuotationPrefill,
    org: OrganizationRow | null,
  ): DealQuotationPrefill {
    if (!org) return prefill;

    const rev =
      org.annualRevenue != null && Number.isFinite(org.annualRevenue) && org.annualRevenue > 0
        ? org.annualRevenue.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : '';

    return {
      ...prefill,
      officeAddress: prefill.officeAddress.trim() || org.address?.trim() || '',
      website: prefill.website.trim() || org.website?.trim() || '',
      gst: prefill.gst.trim() || org.gst?.trim() || '',
      salutation: prefill.salutation.trim() || '',
      employees: prefill.employees.trim() || org.employees?.trim() || '',
      territory: prefill.territory.trim() || org.territory?.trim() || '',
      industry: prefill.industry.trim() || org.industry?.trim() || '',
      annualRevenue: prefill.annualRevenue.trim() || rev,
      salutationId: prefill.salutationId ?? null,
      employeeCountId: prefill.employeeCountId ?? org.employeeCountId ?? null,
      territoryId: prefill.territoryId ?? org.territoryId ?? null,
      industryId: prefill.industryId ?? org.industryId ?? null,
    };
  }
}

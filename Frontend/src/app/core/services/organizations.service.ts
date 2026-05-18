import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { OrganizationRow } from '../../features/organizations/organizations.component';
import { normalizeOrganizationRow } from '../../shared/utils/normalize-local-rows';
import { OrganizationHttpService } from './organizations/organization-http.service';
import { useOrganizationsFromApi } from './organizations/organization-resolve.service';
import { LocalDataService } from './local-data.service';

function mapOrg(row: Record<string, unknown>): OrganizationRow {
  return normalizeOrganizationRow(row);
}

function useOrganizationsFromLocalStorage(): boolean {
  return environment.useMockData && !useOrganizationsFromApi();
}

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);
  private readonly orgHttp = inject(OrganizationHttpService);

  getAll(): Observable<OrganizationRow[]> {
    if (useOrganizationsFromLocalStorage()) {
      return of(this.local.getAll('organizations').map(mapOrg));
    }
    return this.orgHttp.list();
  }

  getById(id: number): Observable<OrganizationRow | null> {
    if (useOrganizationsFromLocalStorage()) {
      const row = this.local.getById('organizations', id);
      return of(row ? mapOrg(row) : null);
    }
    return this.http.get<OrganizationRow>(`${environment.apiUrl}/organizations/${id}`) as Observable<OrganizationRow | null>;
  }

  create(data: Omit<OrganizationRow, 'id'>): Observable<OrganizationRow> {
    if (useOrganizationsFromLocalStorage()) {
      return of(mapOrg(this.local.create('organizations', data as Record<string, unknown>)));
    }
    return this.orgHttp
      .create({
        name: data.name,
        territory: data.territory,
        industry: data.industry,
        website: data.website,
      })
      .pipe(
        map((row) => ({
          ...row,
          annualRevenue: data.annualRevenue,
          employees: data.employees ?? row.employees,
          lastModified: data.lastModified || row.lastModified,
        })),
      );
  }

  update(id: number, data: Partial<Omit<OrganizationRow, 'id'>>): Observable<OrganizationRow | null> {
    if (useOrganizationsFromLocalStorage()) {
      const row = this.local.update('organizations', id, data as Record<string, unknown>);
      return of(row ? mapOrg(row) : null);
    }
    return this.http.put<OrganizationRow>(`${environment.apiUrl}/organizations/${id}`, data) as Observable<OrganizationRow | null>;
  }

  delete(id: number): Observable<void> {
    if (useOrganizationsFromLocalStorage()) {
      this.local.delete('organizations', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/organizations/${id}`);
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { OrganizationRow } from '../../features/organizations/organizations.component';
import { LocalDataService } from './local-data.service';

function mapOrg(row: Record<string, unknown>): OrganizationRow {
  const id = row['id'];
  return {
    ...(row as unknown as OrganizationRow),
    id: String(id),
  };
}

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<OrganizationRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('organizations').map(mapOrg));
    }
    return this.http.get<OrganizationRow[]>(`${environment.apiUrl}/organizations`);
  }

  getById(id: number): Observable<OrganizationRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('organizations', id);
      return of(row ? mapOrg(row) : null);
    }
    return this.http.get<OrganizationRow>(`${environment.apiUrl}/organizations/${id}`) as Observable<OrganizationRow | null>;
  }

  create(data: Omit<OrganizationRow, 'id'>): Observable<OrganizationRow> {
    if (environment.useMockData) {
      return of(mapOrg(this.local.create('organizations', data as Record<string, unknown>)));
    }
    return this.http.post<OrganizationRow>(`${environment.apiUrl}/organizations`, data);
  }

  update(id: number, data: Partial<Omit<OrganizationRow, 'id'>>): Observable<OrganizationRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('organizations', id, data as Record<string, unknown>);
      return of(row ? mapOrg(row) : null);
    }
    return this.http.put<OrganizationRow>(`${environment.apiUrl}/organizations/${id}`, data) as Observable<OrganizationRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('organizations', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/organizations/${id}`);
  }
}

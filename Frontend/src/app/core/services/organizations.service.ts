import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { OrganizationRow } from '../../features/organizations/organizations.component';
import {
  organizationCreatePayload,
  type OrganizationCreateInput,
} from './organizations/organization-api.mapper';
import { OrganizationHttpService } from './organizations/organization-http.service';

function toCreateInput(data: Omit<OrganizationRow, 'id'>): OrganizationCreateInput {
  return {
    name: data.name,
    website: data.website,
    gst: data.gst,
    territory: data.territory,
    territoryId: data.territoryId,
    industry: data.industry,
    industryId: data.industryId,
    employees: data.employees,
    employeeCountId: data.employeeCountId,
    annualRevenue: data.annualRevenue,
    address: data.address,
  };
}

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private readonly http = inject(HttpClient);
  private readonly orgHttp = inject(OrganizationHttpService);

  getAll(): Observable<OrganizationRow[]> {
    return this.orgHttp.list();
  }

  getById(id: number): Observable<OrganizationRow | null> {
    return this.orgHttp.getById(id);
  }

  create(data: Omit<OrganizationRow, 'id'>): Observable<OrganizationRow> {
    return this.orgHttp.create(toCreateInput(data));
  }

  update(id: number, data: Omit<OrganizationRow, 'id'>): Observable<OrganizationRow> {
    return this.orgHttp.put(id, organizationCreatePayload(toCreateInput(data)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/organizations/${id}`);
  }
}

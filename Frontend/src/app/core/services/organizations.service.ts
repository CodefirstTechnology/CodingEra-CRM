import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { OrganizationRow } from '../../features/organizations/organizations.component';

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<OrganizationRow[]> {
    return this.http.get<OrganizationRow[]>(`${environment.apiUrl}/organizations`);
  }

  getById(id: number): Observable<OrganizationRow | null> {
    return this.http.get<OrganizationRow>(`${environment.apiUrl}/organizations/${id}`) as Observable<OrganizationRow | null>;
  }

  create(data: Omit<OrganizationRow, 'id'>): Observable<OrganizationRow> {
    return this.http.post<OrganizationRow>(`${environment.apiUrl}/organizations`, data);
  }

  update(id: number, data: Partial<Omit<OrganizationRow, 'id'>>): Observable<OrganizationRow | null> {
    return this.http.put<OrganizationRow>(`${environment.apiUrl}/organizations/${id}`, data) as Observable<OrganizationRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/organizations/${id}`);
  }
}

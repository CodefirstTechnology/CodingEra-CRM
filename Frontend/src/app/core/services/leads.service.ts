import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { LeadRow } from '../../features/leads/lead-row.model';
import { LocalDataService } from './local-data.service';

function mapLead(row: Record<string, unknown>): LeadRow {
  const id = row['id'];
  return {
    ...(row as unknown as LeadRow),
    id: String(id),
  };
}

@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<LeadRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('leads').map(mapLead));
    }
    return this.http.get<LeadRow[]>(`${environment.apiUrl}/leads`);
  }

  getById(id: number): Observable<LeadRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('leads', id);
      return of(row ? mapLead(row) : null);
    }
    return this.http.get<LeadRow>(`${environment.apiUrl}/leads/${id}`) as Observable<LeadRow | null>;
  }

  create(data: Omit<LeadRow, 'id'>): Observable<LeadRow> {
    if (environment.useMockData) {
      return of(mapLead(this.local.create('leads', data as Record<string, unknown>)));
    }
    return this.http.post<LeadRow>(`${environment.apiUrl}/leads`, data);
  }

  update(id: number, data: Partial<Omit<LeadRow, 'id'>>): Observable<LeadRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('leads', id, data as Record<string, unknown>);
      return of(row ? mapLead(row) : null);
    }
    return this.http.put<LeadRow>(`${environment.apiUrl}/leads/${id}`, data) as Observable<LeadRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('leads', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/leads/${id}`);
  }
}

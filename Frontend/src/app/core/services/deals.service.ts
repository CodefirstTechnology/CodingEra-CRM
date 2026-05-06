import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DealRow } from '../../features/deals/deals.component';
import { LocalDataService } from './local-data.service';

function mapDeal(row: Record<string, unknown>): DealRow {
  const id = row['id'];
  return {
    ...(row as unknown as DealRow),
    id: String(id),
  };
}

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<DealRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('deals').map(mapDeal));
    }
    return this.http.get<DealRow[]>(`${environment.apiUrl}/deals`);
  }

  getById(id: number): Observable<DealRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('deals', id);
      return of(row ? mapDeal(row) : null);
    }
    return this.http.get<DealRow>(`${environment.apiUrl}/deals/${id}`) as Observable<DealRow | null>;
  }

  create(data: Omit<DealRow, 'id'>): Observable<DealRow> {
    if (environment.useMockData) {
      return of(mapDeal(this.local.create('deals', data as Record<string, unknown>)));
    }
    return this.http.post<DealRow>(`${environment.apiUrl}/deals`, data);
  }

  update(id: number, data: Partial<Omit<DealRow, 'id'>>): Observable<DealRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('deals', id, data as Record<string, unknown>);
      return of(row ? mapDeal(row) : null);
    }
    return this.http.put<DealRow>(`${environment.apiUrl}/deals/${id}`, data) as Observable<DealRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('deals', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/deals/${id}`);
  }
}

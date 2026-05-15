import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DealRow } from '../../features/deals/deals.component';

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<DealRow[]> {
    return this.http.get<DealRow[]>(`${environment.apiUrl}/deals`);
  }

  getById(id: number): Observable<DealRow | null> {
    return this.http.get<DealRow>(`${environment.apiUrl}/deals/${id}`) as Observable<DealRow | null>;
  }

  create(data: Omit<DealRow, 'id'>): Observable<DealRow> {
    return this.http.post<DealRow>(`${environment.apiUrl}/deals`, data);
  }

  update(id: number, data: Partial<Omit<DealRow, 'id'>>): Observable<DealRow | null> {
    return this.http.put<DealRow>(`${environment.apiUrl}/deals/${id}`, data) as Observable<DealRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/deals/${id}`);
  }
}

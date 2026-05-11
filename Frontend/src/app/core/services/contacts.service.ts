import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ContactRow } from '../../features/contacts/contacts.component';
import { normalizeContactRow } from '../../shared/utils/normalize-local-rows';
import { LocalDataService } from './local-data.service';

function mapContact(row: Record<string, unknown>): ContactRow {
  return normalizeContactRow(row);
}

@Injectable({ providedIn: 'root' })
export class ContactsService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<ContactRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('contacts').map(mapContact));
    }
    return this.http.get<ContactRow[]>(`${environment.apiUrl}/contacts`);
  }

  getById(id: number): Observable<ContactRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('contacts', id);
      return of(row ? mapContact(row) : null);
    }
    return this.http.get<ContactRow>(`${environment.apiUrl}/contacts/${id}`) as Observable<ContactRow | null>;
  }

  create(data: Omit<ContactRow, 'id'>): Observable<ContactRow> {
    if (environment.useMockData) {
      return of(mapContact(this.local.create('contacts', data as Record<string, unknown>)));
    }
    return this.http.post<ContactRow>(`${environment.apiUrl}/contacts`, data);
  }

  update(id: number, data: Partial<Omit<ContactRow, 'id'>>): Observable<ContactRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('contacts', id, data as Record<string, unknown>);
      return of(row ? mapContact(row) : null);
    }
    return this.http.put<ContactRow>(`${environment.apiUrl}/contacts/${id}`, data) as Observable<ContactRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('contacts', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/contacts/${id}`);
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ContactRow } from '../../features/contacts/contacts.component';

@Injectable({ providedIn: 'root' })
export class ContactsService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<ContactRow[]> {
    return this.http.get<ContactRow[]>(`${environment.apiUrl}/contacts`);
  }

  getById(id: number): Observable<ContactRow | null> {
    return this.http.get<ContactRow>(`${environment.apiUrl}/contacts/${id}`) as Observable<ContactRow | null>;
  }

  create(data: Omit<ContactRow, 'id'>): Observable<ContactRow> {
    return this.http.post<ContactRow>(`${environment.apiUrl}/contacts`, data);
  }

  update(id: number, data: Partial<Omit<ContactRow, 'id'>>): Observable<ContactRow | null> {
    return this.http.put<ContactRow>(`${environment.apiUrl}/contacts/${id}`, data) as Observable<ContactRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/contacts/${id}`);
  }
}

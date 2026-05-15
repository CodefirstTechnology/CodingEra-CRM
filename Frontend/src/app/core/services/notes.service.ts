import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { NoteRow } from '../../features/notes/notes.component';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<NoteRow[]> {
    return this.http.get<NoteRow[]>(`${environment.apiUrl}/notes`);
  }

  getById(id: number): Observable<NoteRow | null> {
    return this.http.get<NoteRow>(`${environment.apiUrl}/notes/${id}`) as Observable<NoteRow | null>;
  }

  create(data: Omit<NoteRow, 'id'>): Observable<NoteRow> {
    return this.http.post<NoteRow>(`${environment.apiUrl}/notes`, data);
  }

  update(id: number, data: Partial<Omit<NoteRow, 'id'>>): Observable<NoteRow | null> {
    return this.http.put<NoteRow>(`${environment.apiUrl}/notes/${id}`, data) as Observable<NoteRow | null>;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/notes/${id}`);
  }
}

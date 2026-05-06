import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { NoteRow } from '../../features/notes/notes.component';
import { normalizeNoteRow } from '../../shared/utils/normalize-local-rows';
import { LocalDataService } from './local-data.service';

function mapNote(row: Record<string, unknown>): NoteRow {
  return normalizeNoteRow(row);
}

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalDataService);

  getAll(): Observable<NoteRow[]> {
    if (environment.useMockData) {
      return of(this.local.getAll('notes').map(mapNote));
    }
    return this.http.get<NoteRow[]>(`${environment.apiUrl}/notes`);
  }

  getById(id: number): Observable<NoteRow | null> {
    if (environment.useMockData) {
      const row = this.local.getById('notes', id);
      return of(row ? mapNote(row) : null);
    }
    return this.http.get<NoteRow>(`${environment.apiUrl}/notes/${id}`) as Observable<NoteRow | null>;
  }

  create(data: Omit<NoteRow, 'id'>): Observable<NoteRow> {
    if (environment.useMockData) {
      return of(mapNote(this.local.create('notes', data as Record<string, unknown>)));
    }
    return this.http.post<NoteRow>(`${environment.apiUrl}/notes`, data);
  }

  update(id: number, data: Partial<Omit<NoteRow, 'id'>>): Observable<NoteRow | null> {
    if (environment.useMockData) {
      const row = this.local.update('notes', id, data as Record<string, unknown>);
      return of(row ? mapNote(row) : null);
    }
    return this.http.put<NoteRow>(`${environment.apiUrl}/notes/${id}`, data) as Observable<NoteRow | null>;
  }

  delete(id: number): Observable<void> {
    if (environment.useMockData) {
      this.local.delete('notes', id);
      return of(undefined);
    }
    return this.http.delete<void>(`${environment.apiUrl}/notes/${id}`);
  }
}

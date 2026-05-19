import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { NoteRow } from '../../features/notes/notes.component';
import {
  filterNotesForUser,
} from '../../features/user-dashboard/utils/user-ownership.util';
import { NoteHttpService } from './notes/note-http.service';
import { mapNoteApiRecord } from './notes/note-api.mapper';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly http = inject(HttpClient);
  private readonly noteHttp = inject(NoteHttpService);

  getAll(): Observable<NoteRow[]> {
    return this.noteHttp.list();
  }

  /** Notes by author or linked to the user's leads/deals. */
  getAssignedToUser(
    userId: string,
    userName: string,
    userEmail: string,
    leadIds: ReadonlySet<string>,
    dealIds: ReadonlySet<string>,
  ): Observable<NoteRow[]> {
    const numericId = Number(userId);
    const query =
      Number.isFinite(numericId) && numericId > 0 ? { userId: Math.trunc(numericId) } : undefined;

    return this.noteHttp.list(query).pipe(
      catchError(() => this.noteHttp.list()),
      map((rows) => filterNotesForUser(rows, userId, userName, userEmail, leadIds, dealIds)),
    );
  }

  getById(id: number): Observable<NoteRow | null> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/notes/${id}`)
      .pipe(map((raw) => (raw != null ? mapNoteApiRecord(raw) : null)));
  }

  create(data: Omit<NoteRow, 'id'>): Observable<NoteRow> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/notes`, data)
      .pipe(map((raw) => mapNoteApiRecord(raw)));
  }

  update(id: number, data: Partial<Omit<NoteRow, 'id'>>): Observable<NoteRow | null> {
    return this.http
      .put<unknown>(`${environment.apiUrl}/notes/${id}`, data)
      .pipe(map((raw) => (raw != null ? mapNoteApiRecord(raw) : null)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/notes/${id}`);
  }
}

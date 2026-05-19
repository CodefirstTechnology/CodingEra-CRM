import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { NoteRow } from '../../../features/notes/notes.component';
import { extractNoteRecords, mapNoteApiRecord } from './note-api.mapper';

export interface NoteListQuery {
  userId?: number;
  authorUserId?: number;
  createdByUserId?: number;
}

@Injectable({ providedIn: 'root' })
export class NoteHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/notes`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(query?: NoteListQuery): Observable<NoteRow[]> {
    let params = new HttpParams();
    const uid = query?.userId ?? query?.authorUserId ?? query?.createdByUserId;
    if (uid != null && uid > 0) {
      params = params
        .set('userId', String(uid))
        .set('authorUserId', String(uid))
        .set('createdByUserId', String(uid));
    }

    return this.http.get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params }).pipe(
      map((raw) => extractNoteRecords(raw).map((item) => mapNoteApiRecord(item))),
    );
  }
}

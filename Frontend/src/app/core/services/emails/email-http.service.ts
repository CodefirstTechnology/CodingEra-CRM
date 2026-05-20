import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { mapEmailApiRecord, mapEmailList } from './email-api.mapper';
import type { EmailListQuery, EntityEmailItem, SendEmailDto } from './email-api.models';

@Injectable({ providedIn: 'root' })
export class EmailHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/emails`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(
    query: EmailListQuery,
    resolveSenderName?: (userId: number | null) => string,
  ): Observable<EntityEmailItem[]> {
    let params = new HttpParams()
      .set('entityType', query.entityType)
      .set('entityId', String(query.entityId));
    if (query.userId != null && query.userId > 0) {
      params = params.set('userId', String(query.userId));
    }

    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params })
      .pipe(map((raw) => mapEmailList(raw, resolveSenderName)));
  }

  send(
    body: SendEmailDto,
    resolveSenderName?: (userId: number | null) => string,
  ): Observable<EntityEmailItem> {
    return this.http.post<unknown>(this.baseUrl, body, { headers: this.jsonHeaders() }).pipe(
      map((raw) => {
        const row = mapEmailApiRecord(raw, resolveSenderName);
        if (!row) throw new Error('Invalid email response from server.');
        return row;
      }),
    );
  }
}

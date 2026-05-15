import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { LeadApiDto } from './lead-api.models';

export interface LeadListQuery {
  leadSource?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class LeadHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/leads`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`);
    }
    return h;
  }

  list(query?: LeadListQuery): Observable<LeadApiDto[]> {
    let params = new HttpParams();
    if (query?.leadSource?.trim()) {
      params = params.set('leadSource', query.leadSource.trim());
    }
    if (query?.status?.trim()) {
      params = params.set('status', query.status.trim());
    }
    return this.http.get<LeadApiDto[]>(this.baseUrl, {
      headers: this.jsonHeaders(),
      params,
    });
  }

  getById(id: number): Observable<LeadApiDto | null> {
    return this.http.get<LeadApiDto>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() }).pipe(
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of(null) : throwError(() => err),
      ),
    );
  }

  create(body: LeadApiDto): Observable<LeadApiDto> {
    return this.http.post<LeadApiDto>(this.baseUrl, body, { headers: this.jsonHeaders() });
  }

  put(id: number, body: LeadApiDto): Observable<LeadApiDto> {
    return this.http.put<LeadApiDto>(`${this.baseUrl}/${id}`, body, { headers: this.jsonHeaders() });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.jsonHeaders() });
  }
}

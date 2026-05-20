import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { mapActivityList } from './activity-api.mapper';
import type { ActivityEntityType, ActivityListQuery, ActivityRow } from './activity-api.models';

@Injectable({ providedIn: 'root' })
export class ActivityHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/activities`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  list(query?: ActivityListQuery): Observable<ActivityRow[]> {
    let params = new HttpParams();
    if (query?.entityType) params = params.set('entityType', query.entityType);
    if (query?.entityId != null && query.entityId > 0) {
      params = params.set('entityId', String(query.entityId));
    }
    if (query?.userId != null && query.userId > 0) {
      params = params.set('userId', String(query.userId));
    }

    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders(), params })
      .pipe(map((raw) => mapActivityList(raw)));
  }

  getForLead(leadId: number): Observable<ActivityRow[]> {
    return this.getByEntityPath('leads', leadId);
  }

  getForDeal(dealId: number): Observable<ActivityRow[]> {
    return this.getByEntityPath('deals', dealId);
  }

  getForContact(contactId: number): Observable<ActivityRow[]> {
    return this.getByEntityPath('contacts', contactId);
  }

  getForOrganization(organizationId: number): Observable<ActivityRow[]> {
    return this.getByEntityPath('organizations', organizationId);
  }

  private getByEntityPath(
    segment: 'leads' | 'deals' | 'contacts' | 'organizations',
    id: number,
  ): Observable<ActivityRow[]> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${segment}/${id}`, { headers: this.jsonHeaders() })
      .pipe(
        map((raw) => mapActivityList(raw)),
        catchError((err: HttpErrorResponse) => (err.status === 404 ? of([]) : throwError(() => err))),
      );
  }

  /** Convenience when callers already know entity type + id. */
  getForEntity(entityType: ActivityEntityType, entityId: number): Observable<ActivityRow[]> {
    switch (entityType) {
      case 'lead':
        return this.getForLead(entityId);
      case 'deal':
        return this.getForDeal(entityId);
      case 'contact':
        return this.getForContact(entityId);
      case 'organization':
        return this.getForOrganization(entityId);
      default:
        return this.list({ entityType, entityId });
    }
  }
}

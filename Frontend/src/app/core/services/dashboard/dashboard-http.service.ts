import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type {
  DailyBriefingMetrics,
  MorningBriefingResponse,
  UserDashboardPreference,
} from './dashboard-api.models';
import {
  mapMorningBriefingResponse,
  mapUserDashboardPreference,
} from './dashboard-api.mapper';

@Injectable({ providedIn: 'root' })
export class DashboardHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/dashboard`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  getPreferences(): Observable<UserDashboardPreference> {
    return this.http
      .get<unknown>(`${this.baseUrl}/preferences`, { headers: this.jsonHeaders() })
      .pipe(map(mapUserDashboardPreference));
  }

  updatePreferences(morningBriefingEnabled: boolean): Observable<UserDashboardPreference> {
    return this.http
      .put<unknown>(
        `${this.baseUrl}/preferences`,
        { morningBriefingEnabled },
        { headers: this.jsonHeaders() },
      )
      .pipe(map(mapUserDashboardPreference));
  }

  /** Returns today's cached briefing text only (no regeneration). */
  getCachedMorningBriefing(): Observable<MorningBriefingResponse> {
    return this.http
      .get<unknown>(`${this.baseUrl}/morning-briefing`, { headers: this.jsonHeaders() })
      .pipe(map(mapMorningBriefingResponse));
  }

  /** Generates or returns cached briefing using today-only metrics from the dashboard. */
  postMorningBriefing(
    metrics: DailyBriefingMetrics,
    regenerate = false,
  ): Observable<MorningBriefingResponse> {
    const url = regenerate
      ? `${this.baseUrl}/morning-briefing?regenerate=true`
      : `${this.baseUrl}/morning-briefing`;
    return this.http
      .post<unknown>(url, metrics, { headers: this.jsonHeaders() })
      .pipe(map(mapMorningBriefingResponse));
  }

  resetBriefingDaily(): Observable<void> {
    return this.http
      .post<unknown>(`${this.baseUrl}/morning-briefing/reset-daily`, null, {
        headers: this.jsonHeaders(),
      })
      .pipe(map(() => undefined));
  }

  markBriefingPlayed(): Observable<void> {
    return this.http
      .post<unknown>(`${this.baseUrl}/morning-briefing/mark-played`, null, {
        headers: this.jsonHeaders(),
      })
      .pipe(map(() => undefined));
  }
}

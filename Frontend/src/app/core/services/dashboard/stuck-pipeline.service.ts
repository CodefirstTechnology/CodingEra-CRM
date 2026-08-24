import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { StuckPipelineResponse } from './stuck-pipeline.models';

@Injectable({ providedIn: 'root' })
export class StuckPipelineService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  getStuckPipeline(userId?: number): Observable<StuckPipelineResponse | null> {
    const user = this.auth.user();
    const effectiveUserId = userId ?? (user?.id ? Number(user.id) : undefined);

    let params = new HttpParams();
    if (effectiveUserId != null && Number.isFinite(effectiveUserId) && effectiveUserId > 0) {
      params = params.set('userId', String(effectiveUserId));
    }

    const base = (environment.apiUrl || '').replace(/\/$/, '');
    return this.http
      .get<StuckPipelineResponse>(`${base}/dashboard/stuck-pipeline`, {
        params,
      })
      .pipe(
        catchError(() => of(null)),
      );
  }
}

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { CompanyProfile, CompanyProfileUpsert } from './company-profile-api.models';
import { mapCompanyProfile, toCompanyProfileUpsertBody } from './company-profile-api.mapper';

@Injectable({ providedIn: 'root' })
export class CompanyProfileHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/company-profile`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  get(): Observable<CompanyProfile> {
    return this.http
      .get<unknown>(this.baseUrl, { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapCompanyProfile(raw)));
  }

  update(profile: CompanyProfileUpsert): Observable<CompanyProfile> {
    return this.http
      .put<unknown>(this.baseUrl, toCompanyProfileUpsertBody(profile), { headers: this.jsonHeaders() })
      .pipe(map((raw) => mapCompanyProfile(raw)));
  }
}

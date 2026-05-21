import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import type { OrganizationRow } from '../../../features/organizations/organizations.component';
import {
  mergeOrganizationLeadSyncWithExisting,
  organizationLeadSyncPayload,
  organizationNumericId,
  type OrganizationEnsureOptions,
} from './organization-api.mapper';
import { OrganizationHttpService } from './organization-http.service';

/** Same shape as lead/org resolve options (see {@link OrganizationEnsureOptions}). */
export type EnsureOrganizationOptions = OrganizationEnsureOptions;

/** Resolves organization IDs via HTTP when the CRM API base URL is configured. */
export function useOrganizationsFromApi(): boolean {
  return !!environment.apiUrl?.trim();
}

/**
 * Finds an organization by name (case-insensitive) or creates one via `POST /api/organizations`.
 * Caches results for the current session to avoid duplicate creates during marketplace import.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationResolveService {
  private readonly orgHttp = inject(OrganizationHttpService);

  private readonly nameToId = new Map<string, number>();
  private preloadDone = false;

  enabled(): boolean {
    return useOrganizationsFromApi();
  }

  /** Loads existing organizations into the in-memory name cache. */
  preload(): Observable<void> {
    if (!this.enabled()) {
      this.preloadDone = true;
      return of(undefined);
    }
    return this.orgHttp.list().pipe(
      tap((rows) => this.seedCache(rows)),
      map(() => undefined),
      catchError((err) => {
        console.warn('[organizations] preload failed', err);
        this.preloadDone = true;
        return of(undefined);
      }),
    );
  }

  resetCache(): void {
    this.nameToId.clear();
    this.preloadDone = false;
  }

  /**
   * Returns a positive `organizationId` for `name`, creating the org on the API when missing.
   */
  ensureOrganizationId(
    name: string,
    options?: OrganizationEnsureOptions,
  ): Observable<number | null> {
    const trimmed = name.trim();
    if (!trimmed) return of(null);
    if (!this.enabled()) return of(null);

    const key = trimmed.toLowerCase();
    const cached = this.nameToId.get(key);
    if (cached != null) {
      return this.syncExistingOrganizationIfNeeded(cached, trimmed, options);
    }

    const create$ = this.orgHttp
      .create({
        name: trimmed,
        territory: options?.territory,
        territoryId: options?.territoryId,
        industry: options?.industry,
        industryId: options?.industryId,
        website: options?.website,
        employees: options?.employees,
        employeeCountId: options?.employeeCountId,
      })
      .pipe(
        map((row) => {
          const id = organizationNumericId(row);
          if (id != null) this.nameToId.set(key, id);
          return id;
        }),
        catchError((err) => {
          console.warn('[organizations] create failed', trimmed, err);
          return of(null);
        }),
      );

    if (this.preloadDone) {
      return create$;
    }

    return this.preload().pipe(
      switchMap(() => {
        const afterPreload = this.nameToId.get(key);
        if (afterPreload != null) {
          return this.syncExistingOrganizationIfNeeded(afterPreload, trimmed, options);
        }
        return create$;
      }),
    );
  }

  /**
   * When an org already exists (preload/cache hit), POST is skipped — PATCH-style PUT keeps
   * industry/territory/employees/website on the org row in sync with the lead form.
   */
  private syncExistingOrganizationIfNeeded(
    organizationId: number,
    orgName: string,
    options?: OrganizationEnsureOptions,
  ): Observable<number | null> {
    const patch = organizationLeadSyncPayload(orgName, options);
    if (!patch) return of(organizationId);
    return this.orgHttp.getById(organizationId).pipe(
      switchMap((existing) => {
        const merged = mergeOrganizationLeadSyncWithExisting(existing, patch);
        return this.orgHttp.put(organizationId, merged);
      }),
      map(() => organizationId),
      catchError((err) => {
        console.warn('[organizations] sync existing org failed', organizationId, err);
        return of(organizationId);
      }),
    );
  }

  private seedCache(rows: readonly OrganizationRow[]): void {
    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      const id = organizationNumericId(row);
      if (key && id != null) this.nameToId.set(key, id);
    }
    this.preloadDone = true;
  }
}

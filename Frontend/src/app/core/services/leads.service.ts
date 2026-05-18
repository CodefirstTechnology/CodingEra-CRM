import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { LeadRoundRobinService } from './leads/lead-round-robin.service';
import { OrganizationResolveService } from './organizations/organization-resolve.service';
import type { LeadRow } from '../../features/leads/lead-row.model';
import {
  leadCreatePayloadToApiJson,
  mapLeadNormalizedToRow,
  mergeLeadApiDtoWithRowPatch,
} from './leads/lead-api.mapper';
import type { LeadUpsertDto } from './leads/lead-api.models';
import { buildLeadPutJson } from './leads/lead-upsert-body.util';
import { LeadHttpService } from './leads/lead-http.service';

/** Maps failed lead HTTP calls to a short user-facing message. */
export function leadsHttpErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Cannot reach the server. Start the CRM API or check the dev proxy for /api.';
    }
    const body = err.error;
    if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 200);
    if (body && typeof body === 'object') {
      const title = (body as { title?: string }).title;
      const detail = (body as { detail?: string }).detail;
      const message = (body as { message?: string }).message;
      if (typeof title === 'string' && title.trim()) return title.trim();
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
    return err.message || `Request failed (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly leadHttp = inject(LeadHttpService);
  private readonly orgResolve = inject(OrganizationResolveService);
  private readonly roundRobin = inject(LeadRoundRobinService);

  getAll(): Observable<LeadRow[]> {
    return this.leadHttp.list().pipe(map((rows) => rows.map(mapLeadNormalizedToRow)));
  }

  async getAllAsync(): Promise<LeadRow[]> {
    return firstValueFrom(this.getAll());
  }

  getById(id: number): Observable<LeadRow | null> {
    return this.leadHttp.getById(id).pipe(map((dto) => (dto ? mapLeadNormalizedToRow(dto) : null)));
  }

  async getByIdAsync(id: number): Promise<LeadRow | null> {
    return firstValueFrom(this.getById(id));
  }

  create(data: Omit<LeadRow, 'id'>): Observable<LeadRow> {
    const withOwner = this.roundRobin.applyOwnerIfMissing(data);
    return this.withResolvedOrganization(withOwner).pipe(
      switchMap((body) => this.leadHttp.create(body).pipe(map(mapLeadNormalizedToRow))),
      tap(() => this.roundRobin.advanceAfterLeadCreated()),
    );
  }

  async createAsync(data: Omit<LeadRow, 'id'>): Promise<LeadRow> {
    return firstValueFrom(this.create(data));
  }

  /**
   * Loads the current server row, merges your patch, then PUTs the full model
   * so partial updates do not clear unrelated columns on the server.
   */
  update(id: number, patch: Partial<Omit<LeadRow, 'id'>>): Observable<LeadRow | null> {
    return this.leadHttp.getById(id).pipe(
      switchMap((prev) => {
        if (!prev) return of(null);
        return this.resolveOrganizationForPatch(patch).pipe(
          switchMap((organizationId) => {
            const prevForMerge =
              organizationId != null
                ? { ...prev, organizationId, organizationName: patch.organization?.trim() || prev.organizationName }
                : prev;
            const dto = mergeLeadApiDtoWithRowPatch(prevForMerge, patch);
            if (organizationId != null && organizationId > 0) {
              dto.organizationId = organizationId;
            }
            const body = buildLeadPutJson(dto, prevForMerge);
            return this.leadHttp.put(id, body).pipe(map(mapLeadNormalizedToRow));
          }),
        );
      }),
    );
  }

  private resolveOrganizationForPatch(
    patch: Partial<Omit<LeadRow, 'id'>>,
  ): Observable<number | null> {
    const name = patch.organization?.trim();
    if (!name) return of(null);
    return this.orgResolve.ensureOrganizationId(name, {
      territory: patch.territory?.trim() || undefined,
      territoryId: patch.territoryId,
      industry: patch.industry?.trim() || undefined,
      industryId: patch.industryId,
      website: patch.website?.trim() || undefined,
      employees: patch.employees?.trim() || undefined,
      employeeCountId: patch.employeeCountId,
    });
  }

  private withResolvedOrganization(data: Omit<LeadRow, 'id'>): Observable<LeadUpsertDto> {
    const body = leadCreatePayloadToApiJson(data);
    const name = data.organization?.trim();
    if (!name) return of(body);
    return this.orgResolve
      .ensureOrganizationId(name, {
        territory: data.territory?.trim() || undefined,
        territoryId: data.territoryId,
        industry: data.industry?.trim() || undefined,
        industryId: data.industryId,
        website: data.website?.trim() || undefined,
        employees: data.employees?.trim() || undefined,
        employeeCountId: data.employeeCountId,
      })
      .pipe(
        map((organizationId) =>
          organizationId != null && organizationId > 0 ? { ...body, organizationId } : body,
        ),
      );
  }

  async updateAsync(id: number, patch: Partial<Omit<LeadRow, 'id'>>): Promise<LeadRow | null> {
    return firstValueFrom(this.update(id, patch));
  }

  delete(id: number): Observable<void> {
    return this.leadHttp.delete(id);
  }

  async deleteAsync(id: number): Promise<void> {
    return firstValueFrom(this.delete(id));
  }
}

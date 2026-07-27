import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { isAdmin } from '../auth/auth-role.util';
import { DealsService } from './deals.service';
import { LeadConversionStorageService } from './leads/lead-conversion-storage.service';
import { CONVERTED_LEAD_STATUS_NAME } from './leads/lead-status.constants';
import type { ConvertLeadOptions, ConvertLeadResult } from './leads/lead-conversion.types';
import { normalizeGstin } from '../../shared/utils/gstin.util';
import { mapLeadToDealRow } from '../../shared/utils/mappers';
import { isLeadConverted, validateLeadForConversion } from '../../shared/utils/lead-conversion.util';
import { filterLeadsForUser } from '../../features/user-dashboard/utils/user-ownership.util';
import { LeadRoundRobinService } from './leads/lead-round-robin.service';
import { OrganizationResolveService } from './organizations/organization-resolve.service';
import { LeadMasterDataService } from './leads/lead-master-data.service';
import type { LeadRow } from '../../features/leads/lead-row.model';
import {
  leadCreatePayloadToApiJson,
  mapLeadNormalizedToRow,
  applyLeadRowOrgFieldsFromPatch,
  enrichLeadNormalizedFromPatch,
  mergeLeadApiDtoWithRowPatch,
  reconcileLeadNormalizedAfterPut,
} from './leads/lead-api.mapper';
import type { LeadNormalized, LeadUpsertDto } from './leads/lead-api.models';
import { buildLeadPutJson } from './leads/lead-upsert-body.util';
import { LeadHttpService } from './leads/lead-http.service';
import type { LeadImportCommitResult, LeadImportRowDto } from '../../features/leads/import/lead-import-api.models';
import type { LeadExportRequest } from '../../features/leads/export/lead-export.models';
import { PermissionService } from './permission.service';

/** Maps failed lead HTTP calls to a short user-facing message. */
export function leadsHttpErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Cannot reach the server. Start the CRM API or check the dev proxy for /api.';
    }
    const body = err.error;
    if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 200);
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      const validation = formatAspNetValidationErrors(o);
      if (validation) return validation.slice(0, 500);
      const title = o['title'];
      const detail = o['detail'];
      const message = o['message'];
      if (typeof title === 'string' && title.trim()) return title.trim();
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
    return err.message || `Request failed (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

function formatAspNetValidationErrors(body: Record<string, unknown>): string | null {
  const errors = body['errors'];
  if (errors == null || typeof errors !== 'object' || Array.isArray(errors)) return null;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(errors as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      const msgs = val.filter((v): v is string => typeof v === 'string').join('; ');
      if (msgs) parts.push(`${key}: ${msgs}`);
    } else if (typeof val === 'string' && val.trim()) {
      parts.push(`${key}: ${val.trim()}`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly leadHttp = inject(LeadHttpService);
  private readonly orgResolve = inject(OrganizationResolveService);
  private readonly roundRobin = inject(LeadRoundRobinService);
  private readonly dealsService = inject(DealsService);
  private readonly conversionStorage = inject(LeadConversionStorageService);
  private readonly leadMasterData = inject(LeadMasterDataService);
  private readonly permissions = inject(PermissionService);
  private readonly auth = inject(AuthService);

  getAll(): Observable<LeadRow[]> {
    return this.listLeadsWithDealConversion((leads) => leads.map(mapLeadNormalizedToRow));
  }

  /**
   * Leads scoped by backend RBAC (`lead_owner_id`) for the logged-in user.
   * Client-side owner filter is a safety net for merged marketplace rows.
   */
  getAssignedToUser(
    userId: string,
    userName = '',
    userEmail = '',
  ): Observable<LeadRow[]> {
    return this.listLeadsWithDealConversion((leads) =>
      filterLeadsForUser(
        leads.map(mapLeadNormalizedToRow),
        userId,
        userName,
        userEmail,
      ),
    );
  }

  private listLeadsWithDealConversion(
    mapLeads: (normalized: LeadNormalized[]) => LeadRow[],
  ): Observable<LeadRow[]> {
    return forkJoin({
      leads: this.leadHttp.list(),
      deals: this.dealsService.getAll().pipe(catchError(() => of([]))),
    }).pipe(
      map(({ leads, deals }) =>
        this.conversionStorage.enrichLeadRowsWithDeals(mapLeads(leads), deals),
      ),
    );
  }

  async getAllAsync(): Promise<LeadRow[]> {
    return firstValueFrom(this.getAll());
  }

  getById(id: number): Observable<LeadRow | null> {
    return this.leadHttp
      .getById(id)
      .pipe(map((dto) => (dto ? this.conversionStorage.enrichLeadRow(mapLeadNormalizedToRow(dto)) : null)));
  }

  /**
   * Converts a lead into a deal (create deal + update or remove lead).
   * UI should call this only; later swap internals for `POST /api/leads/:id/convert`.
   */
  convertToDeal(leadId: number | string, options: ConvertLeadOptions = {}): Observable<ConvertLeadResult> {
    const idn = typeof leadId === 'number' ? leadId : Number(String(leadId).trim());
    if (!Number.isFinite(idn) || idn <= 0) {
      return throwError(() => new Error('Invalid lead id.'));
    }

    const markAsConverted = options.markAsConverted !== false;
    const removeFromActive = options.removeFromActive === true;

    return forkJoin({
      lead: this.getById(idn),
      statuses: this.leadMasterData.loadLeadStatuses(),
    }).pipe(
      switchMap(({ lead, statuses }) => {
        if (!lead) return throwError(() => new Error('Lead not found.'));
        const conv = this.leadMasterData.resolveConversionLeadStatus(statuses);
        if (isLeadConverted(lead, { id: conv?.id, name: conv?.name })) {
          return throwError(() => new Error('This lead was already converted to a deal.'));
        }
        const validationError = validateLeadForConversion(lead);
        if (validationError) return throwError(() => new Error(validationError));

        const convertedAt = new Date().toISOString();
        return this.dealsService.create(mapLeadToDealRow(lead)).pipe(
          switchMap((deal) => {
            this.conversionStorage.recordConversion({
              leadId: String(idn),
              dealId: deal.id,
              convertedAt,
            });

            if (removeFromActive) {
              return this.delete(idn).pipe(
                map(() => ({ leadId: String(idn), deal, lead: null, convertedAt } satisfies ConvertLeadResult)),
              );
            }

            if (!markAsConverted) {
              return of({ leadId: String(idn), deal, lead, convertedAt } satisfies ConvertLeadResult);
            }

            return this.leadMasterData.loadLeadStatuses().pipe(
              switchMap((statuses) => {
                const conv = this.leadMasterData.resolveConversionLeadStatus(statuses);
                const statusName = conv?.name?.trim() || CONVERTED_LEAD_STATUS_NAME;
                const patch: Partial<Omit<LeadRow, 'id'>> = {
                  status: statusName as LeadRow['status'],
                  updated: 'Just now',
                  isConverted: true,
                  convertedDealId: deal.id,
                  convertedAt,
                };
                if (conv != null && conv.id > 0) {
                  patch.leadStatusId = conv.id;
                }
                return this.update(idn, patch);
              }),
              map(
                (updated) =>
                  ({
                    leadId: String(idn),
                    deal,
                    lead: updated ?? {
                      ...lead,
                      status: CONVERTED_LEAD_STATUS_NAME,
                      isConverted: true,
                      convertedDealId: deal.id,
                      convertedAt,
                      updated: 'Just now',
                    },
                    convertedAt,
                  }) satisfies ConvertLeadResult,
              ),
            );
          }),
        );
      }),
    );
  }

  async getByIdAsync(id: number): Promise<LeadRow | null> {
    return firstValueFrom(this.getById(id));
  }

  create(data: Omit<LeadRow, 'id'>): Observable<LeadRow> {
    const canPickOwner = this.permissions.canAssignLeads() && isAdmin(this.auth.user());
    const ownerProvided = !!data.leadOwnerId?.trim();
    let withOwner = data;
    if (!ownerProvided) {
      if (canPickOwner) {
        withOwner = this.roundRobin.applyOwnerIfMissing(data);
      } else {
        const selfId = this.auth.user()?.id?.trim() ?? '';
        withOwner = selfId ? { ...data, leadOwnerId: selfId } : data;
      }
    }
    const usedRoundRobin = canPickOwner && !ownerProvided && !!withOwner.leadOwnerId?.trim();

    return this.withResolvedOrganization(withOwner).pipe(
      switchMap((body) => {
        const dto = canPickOwner
          ? this.roundRobin.applyToUpsertDto(body)
          : this.applySelfOwnerToUpsertDto(body);
        const orgPatch = this.orgFieldsPatchFromLeadData(data, dto.organizationId ?? null);
        return this.leadHttp.create(dto).pipe(
          map(mapLeadNormalizedToRow),
          map((row) => applyLeadRowOrgFieldsFromPatch(row, orgPatch)),
        );
      }),
      tap(() => {
        if (usedRoundRobin) {
          this.roundRobin.advanceAfterLeadCreated();
        }
      }),
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
        return this.ensureLeadOrganizationFk(prev, patch).pipe(
          switchMap((prevWithOrg) =>
            this.resolveOrganizationForPatch(patch).pipe(
              switchMap((resolvedOrgId) => {
                const patchOrgId = this.parseLeadRowOrganizationFk(patch.organizationId);
                const linkedOrgId =
                  resolvedOrgId != null && resolvedOrgId > 0
                    ? resolvedOrgId
                    : patchOrgId != null
                      ? patchOrgId
                      : prevWithOrg.organizationId != null && prevWithOrg.organizationId > 0
                        ? prevWithOrg.organizationId
                        : null;
                const prevForMerge: LeadNormalized = {
                  ...prevWithOrg,
                  organizationId: linkedOrgId ?? prevWithOrg.organizationId,
                  organizationName:
                    patch.organization?.trim() || prevWithOrg.organizationName || '',
                };
                const dto = mergeLeadApiDtoWithRowPatch(prevForMerge, patch);
                if (linkedOrgId != null && linkedOrgId > 0) {
                  dto.organizationId = linkedOrgId;
                }
                const body = buildLeadPutJson(dto, prevForMerge);
                if (linkedOrgId != null && linkedOrgId > 0) {
                  body['organizationId'] = linkedOrgId;
                }
                const orgName = patch.organization?.trim() || prevForMerge.organizationName?.trim();
                if (orgName) {
                  body['organizationName'] = orgName;
                }
                const reconcileBaseline = enrichLeadNormalizedFromPatch(prevForMerge, patch);
                return this.leadHttp.put(id, body).pipe(
                  map((norm) => reconcileLeadNormalizedAfterPut(norm, reconcileBaseline, patch)),
                  map(mapLeadNormalizedToRow),
                  map((row) => {
                    const orgPatch: Partial<Omit<LeadRow, 'id'>> = { ...patch };
                    if (linkedOrgId != null && linkedOrgId > 0) {
                      orgPatch.organizationId = String(linkedOrgId);
                    }
                    return applyLeadRowOrgFieldsFromPatch(row, orgPatch);
                  }),
                );
              }),
            ),
          ),
        );
      }),
    );
  }

  /**
   * GET payloads sometimes omit `organizationId`. Marketplace leads often only expose the
   * company/product label inside `notes` — that is mirrored into {@link normalizeLeadApiRecord}.
   * This step resolves `/api/organizations` so PUT includes `organizationId` even when the PATCH
   * omits `organization` (e.g. status-only updates).
   */
  private ensureLeadOrganizationFk(
    prev: LeadNormalized,
    patch?: Partial<Omit<LeadRow, 'id'>>,
  ): Observable<LeadNormalized> {
    if (prev.organizationId != null && prev.organizationId > 0) return of(prev);

    /** Only treat organization as cleared when the user explicitly edited that field. */
    if (
      patch != null &&
      'organization' in patch &&
      !String(patch.organization ?? '').trim()
    ) {
      return of(prev);
    }

    const name = String(patch?.organization ?? '').trim() || prev.organizationName?.trim();
    if (!name) return of(prev);
    return this.orgResolve
      .ensureOrganizationId(name, {
        territory: patch?.territory?.trim() || prev.territory?.trim() || undefined,
        territoryId: patch?.territoryId ?? prev.territoryId ?? undefined,
        industry: patch?.industry?.trim() || prev.industry?.trim() || undefined,
        industryId: patch?.industryId ?? prev.industryId ?? undefined,
        website: patch?.website?.trim() || prev.website?.trim() || undefined,
        gst: normalizeGstin(patch?.gst) || normalizeGstin(prev.gst) || undefined,
        employees: patch?.employees?.trim() || prev.employees?.trim() || undefined,
        employeeCountId: patch?.employeeCountId ?? prev.employeeCountId ?? undefined,
      })
      .pipe(
        map((organizationId) =>
          organizationId != null && organizationId > 0
            ? { ...prev, organizationId, organizationName: name || prev.organizationName }
            : prev,
        ),
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
      gst: normalizeGstin(patch.gst) || undefined,
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
        gst: normalizeGstin(data.gst) || undefined,
        employees: data.employees?.trim() || undefined,
        employeeCountId: data.employeeCountId,
      })
      .pipe(
        map((organizationId) => {
          const out: LeadUpsertDto = { ...body, organizationName: name };
          if (organizationId != null && organizationId > 0) {
            out.organizationId = organizationId;
          }
          return out;
        }),
      );
  }

  private parseLeadRowOrganizationFk(id: string | undefined | null): number | null {
    if (id == null || !String(id).trim()) return null;
    const n = Number(String(id).trim());
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }

  private applySelfOwnerToUpsertDto(dto: LeadUpsertDto): LeadUpsertDto {
    if (dto.leadOwnerId != null && dto.leadOwnerId > 0) {
      return dto;
    }
    const selfId = Number(this.auth.user()?.id?.trim());
    if (!Number.isFinite(selfId) || selfId <= 0) {
      return dto;
    }
    return { ...dto, leadOwnerId: selfId };
  }

  private orgFieldsPatchFromLeadData(
    data: Omit<LeadRow, 'id'>,
    organizationId: number | null,
  ): Partial<Omit<LeadRow, 'id'>> {
    const patch: Partial<Omit<LeadRow, 'id'>> = {
      organization: data.organization?.trim() || '',
      website: data.website?.trim() || undefined,
      gst: normalizeGstin(data.gst) || undefined,
      territory: data.territory?.trim() || undefined,
      territoryId: data.territoryId,
      industry: data.industry?.trim() || undefined,
      industryId: data.industryId,
    };
    if (organizationId != null && organizationId > 0) {
      patch.organizationId = String(organizationId);
    }
    return patch;
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

  commitImport(rows: LeadImportRowDto[]): Observable<LeadImportCommitResult> {
    return this.leadHttp.commitImport(rows);
  }

  exportLeads(body: LeadExportRequest): Observable<void> {
    return this.leadHttp.exportLeads(body);
  }
}

import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { filterDealsForUser } from '../../features/user-dashboard/utils/user-ownership.util';
import type { DealRow } from '../../features/deals/deals.component';
import type { DealExportRequest } from '../../features/deals/export/deal-export.models';
import { LeadConversionStorageService } from './leads/lead-conversion-storage.service';
import { LeadOwnerOptionsService } from './leads/lead-owner-options.service';
import {
  dealCreatePayloadToApiJson,
  mapDealNormalizedToRow,
  mergeDealApiDtoWithRowPatch,
} from './deals/deal-api.mapper';
import { DealHttpService, type DealStageHistoryRecord } from './deals/deal-http.service';
import { DealMasterSelectService } from './deals/deal-master-select.service';
import { resolveDealStatusForApi } from './deals/deal-pipeline.constants';

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly dealHttp = inject(DealHttpService);
  private readonly dealMaster = inject(DealMasterSelectService);
  private readonly ownerOpts = inject(LeadOwnerOptionsService);
  private readonly conversionStorage = inject(LeadConversionStorageService);

  private enrichDealList(rows: DealRow[]): DealRow[] {
    return this.conversionStorage.enrichDealRows(this.ownerOpts.enrichDealRows(rows));
  }

  private mergeCreateClientFields(row: DealRow, data: Omit<DealRow, 'id'>): DealRow {
    return this.conversionStorage.enrichDealRow({
      ...row,
      dealTitle: data.dealTitle ?? row.dealTitle,
      contactName: data.contactName ?? row.contactName,
      notes: data.notes ?? row.notes,
      createdAt: data.createdAt ?? row.createdAt,
      source: data.source ?? row.source,
      sourceLeadId: data.sourceLeadId ?? row.sourceLeadId,
      relatedOrganizationId: data.relatedOrganizationId ?? row.relatedOrganizationId,
    });
  }

  getAll(): Observable<DealRow[]> {
    return this.ownerOpts.ensureLoaded().pipe(
      switchMap(() =>
        this.dealHttp.list().pipe(map((rows) => this.enrichDealList(rows.map(mapDealNormalizedToRow)))),
      ),
    );
  }

  /** Deals scoped to logged-in user via `GET /api/deals?userId=` (OpenAPI). */
  getAssignedToUser(
    userId: string,
    userName = '',
    userEmail = '',
  ): Observable<DealRow[]> {
    const numericId = Number(userId);
    const query =
      Number.isFinite(numericId) && numericId > 0 ? { userId: Math.trunc(numericId) } : undefined;

    return this.ownerOpts.ensureLoaded().pipe(
      switchMap(() =>
        this.dealHttp.list(query).pipe(
          catchError(() => this.dealHttp.list()),
          map((rows) => {
            const mapped = this.enrichDealList(rows.map(mapDealNormalizedToRow));
            return filterDealsForUser(mapped, userId, userName, userEmail);
          }),
        ),
      ),
    );
  }

  getById(id: number): Observable<DealRow | null> {
    return this.ownerOpts.ensureLoaded().pipe(
      switchMap(() =>
        this.dealHttp.getById(id).pipe(
          map((dto) => {
            if (!dto) return null;
            const row = this.ownerOpts.applyOwnerToDealRow(mapDealNormalizedToRow(dto));
            return this.conversionStorage.enrichDealRow(row);
          }),
        ),
      ),
    );
  }

  create(data: Omit<DealRow, 'id'>): Observable<DealRow> {
    return this.dealMaster.ensureStatusesLoaded().pipe(
      switchMap((statusOptions) => {
        let body = dealCreatePayloadToApiJson(data);
        const resolved = resolveDealStatusForApi(
          body.status ?? data.status,
          data.dealStatusId ?? body.dealStatusId,
          statusOptions,
        );
        body = {
          ...body,
          status: resolved.status,
          dealStatusId: resolved.dealStatusId ?? body.dealStatusId,
        };
        return this.dealHttp.create(body).pipe(
          map((dto) =>
            this.mergeCreateClientFields(
              this.ownerOpts.applyOwnerToDealRow(mapDealNormalizedToRow(dto)),
              data,
            ),
          ),
        );
      }),
    );
  }

  update(id: number, data: Partial<Omit<DealRow, 'id'>>): Observable<DealRow | null> {
    return this.dealHttp.getById(id).pipe(
      switchMap((prev) => {
        if (!prev) return of(null);
        const body = mergeDealApiDtoWithRowPatch(prev, data);
        return this.dealHttp.put(id, body, prev).pipe(
          map((dto) => this.ownerOpts.applyOwnerToDealRow(mapDealNormalizedToRow(dto))),
        );
      }),
    );
  }

  delete(id: number): Observable<void> {
    return this.dealHttp.delete(id);
  }

  getStageHistory(id: number): Observable<DealStageHistoryRecord[]> {
    return this.dealHttp.getStageHistory(id);
  }

  updateStatus(
    id: number,
    patch: { status: string; dealStatusId?: number | null; comment?: string; lostReason?: string },
  ): Observable<DealRow | null> {
    return this.dealHttp.patchStatus(id, patch).pipe(
      map((dto) => {
        if (!dto) return null;
        return this.ownerOpts.applyOwnerToDealRow(mapDealNormalizedToRow(dto));
      }),
    );
  }

  exportDeals(body: DealExportRequest): Observable<void> {
    return this.dealHttp.exportDeals(body);
  }
}

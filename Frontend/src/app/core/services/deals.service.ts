import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { filterDealsForUser } from '../../features/user-dashboard/utils/user-ownership.util';
import type { DealRow } from '../../features/deals/deals.component';
import { LeadOwnerOptionsService } from './leads/lead-owner-options.service';
import {
  dealCreatePayloadToApiJson,
  mapDealNormalizedToRow,
  mergeDealApiDtoWithRowPatch,
} from './deals/deal-api.mapper';
import { DealHttpService } from './deals/deal-http.service';

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly dealHttp = inject(DealHttpService);
  private readonly ownerOpts = inject(LeadOwnerOptionsService);

  getAll(): Observable<DealRow[]> {
    return this.ownerOpts.ensureLoaded().pipe(
      switchMap(() =>
        this.dealHttp.list().pipe(map((rows) => this.ownerOpts.enrichDealRows(rows.map(mapDealNormalizedToRow)))),
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
            const mapped = this.ownerOpts.enrichDealRows(rows.map(mapDealNormalizedToRow));
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
            const row = mapDealNormalizedToRow(dto);
            return this.ownerOpts.applyOwnerToDealRow(row);
          }),
        ),
      ),
    );
  }

  create(data: Omit<DealRow, 'id'>): Observable<DealRow> {
    const body = dealCreatePayloadToApiJson(data);
    return this.dealHttp.create(body).pipe(
      map((dto) => this.ownerOpts.applyOwnerToDealRow(mapDealNormalizedToRow(dto))),
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
}

import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { DealRow } from '../../features/deals/deals.component';
import { normalizeDealRow } from '../../shared/utils/normalize-local-rows';
import {
  dealCreatePayloadToApiJson,
  mapDealNormalizedToRow,
  mergeDealApiDtoWithRowPatch,
} from './deals/deal-api.mapper';
import { DealHttpService } from './deals/deal-http.service';
import { LocalDataService } from './local-data.service';

function mapDeal(row: Record<string, unknown>): DealRow {
  return normalizeDealRow(row);
}

/** When global mock is on, deals still use the API if this flag is true. */
function useDealsFromLocalStorage(): boolean {
  const live = (environment as { useLiveDealsApi?: boolean }).useLiveDealsApi === true;
  return environment.useMockData && !live;
}

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly local = inject(LocalDataService);
  private readonly dealHttp = inject(DealHttpService);

  getAll(): Observable<DealRow[]> {
    if (useDealsFromLocalStorage()) {
      return of(this.local.getAll('deals').map(mapDeal));
    }
    return this.dealHttp.list().pipe(map((rows) => rows.map(mapDealNormalizedToRow)));
  }

  getById(id: number): Observable<DealRow | null> {
    if (useDealsFromLocalStorage()) {
      const row = this.local.getById('deals', id);
      return of(row ? mapDeal(row) : null);
    }
    return this.dealHttp.getById(id).pipe(map((dto) => (dto ? mapDealNormalizedToRow(dto) : null)));
  }

  create(data: Omit<DealRow, 'id'>): Observable<DealRow> {
    if (useDealsFromLocalStorage()) {
      return of(mapDeal(this.local.create('deals', data as Record<string, unknown>)));
    }
    const body = dealCreatePayloadToApiJson(data);
    return this.dealHttp.create(body).pipe(map(mapDealNormalizedToRow));
  }

  update(id: number, data: Partial<Omit<DealRow, 'id'>>): Observable<DealRow | null> {
    if (useDealsFromLocalStorage()) {
      const row = this.local.update('deals', id, data as Record<string, unknown>);
      return of(row ? mapDeal(row) : null);
    }
    return this.dealHttp.getById(id).pipe(
      switchMap((prev) => {
        if (!prev) return of(null);
        const body = mergeDealApiDtoWithRowPatch(prev, data);
        return this.dealHttp.put(id, body).pipe(map(mapDealNormalizedToRow));
      }),
    );
  }

  delete(id: number): Observable<void> {
    if (useDealsFromLocalStorage()) {
      this.local.delete('deals', id);
      return of(undefined);
    }
    return this.dealHttp.delete(id);
  }
}

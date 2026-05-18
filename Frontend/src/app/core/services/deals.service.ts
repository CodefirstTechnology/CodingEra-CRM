import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type { DealRow } from '../../features/deals/deals.component';
import {
  dealCreatePayloadToApiJson,
  mapDealNormalizedToRow,
  mergeDealApiDtoWithRowPatch,
} from './deals/deal-api.mapper';
import { DealHttpService } from './deals/deal-http.service';

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly dealHttp = inject(DealHttpService);

  getAll(): Observable<DealRow[]> {
    return this.dealHttp.list().pipe(map((rows) => rows.map(mapDealNormalizedToRow)));
  }

  getById(id: number): Observable<DealRow | null> {
    return this.dealHttp.getById(id).pipe(map((dto) => (dto ? mapDealNormalizedToRow(dto) : null)));
  }

  create(data: Omit<DealRow, 'id'>): Observable<DealRow> {
    const body = dealCreatePayloadToApiJson(data);
    return this.dealHttp.create(body).pipe(map(mapDealNormalizedToRow));
  }

  update(id: number, data: Partial<Omit<DealRow, 'id'>>): Observable<DealRow | null> {
    return this.dealHttp.getById(id).pipe(
      switchMap((prev) => {
        if (!prev) return of(null);
        const body = mergeDealApiDtoWithRowPatch(prev, data);
        return this.dealHttp.put(id, body).pipe(map(mapDealNormalizedToRow));
      }),
    );
  }

  delete(id: number): Observable<void> {
    return this.dealHttp.delete(id);
  }
}

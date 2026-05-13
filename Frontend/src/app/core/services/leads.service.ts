import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type { LeadRow } from '../../features/leads/lead-row.model';
import {
  leadCreatePayloadToApiJson,
  mapLeadApiDtoToRow,
  mergeLeadApiDtoWithRowPatch,
} from './leads/lead-api.mapper';
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

  getAll(): Observable<LeadRow[]> {
    return this.leadHttp.list().pipe(map((rows) => rows.map(mapLeadApiDtoToRow)));
  }

  async getAllAsync(): Promise<LeadRow[]> {
    return firstValueFrom(this.getAll());
  }

  getById(id: number): Observable<LeadRow | null> {
    return this.leadHttp.getById(id).pipe(map((dto) => (dto ? mapLeadApiDtoToRow(dto) : null)));
  }

  async getByIdAsync(id: number): Promise<LeadRow | null> {
    return firstValueFrom(this.getById(id));
  }

  create(data: Omit<LeadRow, 'id'>): Observable<LeadRow> {
    const body = leadCreatePayloadToApiJson(data);
    return this.leadHttp.create(body).pipe(map(mapLeadApiDtoToRow));
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
        const body = mergeLeadApiDtoWithRowPatch(prev, patch);
        return this.leadHttp.put(id, body).pipe(map(mapLeadApiDtoToRow));
      }),
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

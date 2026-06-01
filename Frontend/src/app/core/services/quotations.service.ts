import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  QuotationListItem,
  QuotationNextNumber,
  QuotationSettings,
  QuotationUpsertDto,
} from './quotations/quotation-api.models';
import {
  QuotationHttpService,
  type QuotationListQuery,
} from './quotations/quotation-http.service';

export function quotationHttpErrorMessage(err: unknown, fallback = 'Request failed.'): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body != null && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      const msg = o['message'] ?? o['title'];
      if (typeof msg === 'string' && msg.trim()) return msg;
      const errors = o['errors'];
      if (Array.isArray(errors) && errors.length) {
        return errors.map(String).join(' ');
      }
    }
    if (typeof body === 'string' && body.trim()) return body;
    if (err.status === 400) return 'Please check required fields and try again.';
    if (err.status === 404) return 'Quotation not found.';
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class QuotationsService {
  private readonly http = inject(QuotationHttpService);

  list(query?: QuotationListQuery): Observable<QuotationListItem[]> {
    return this.http.list(query);
  }

  getStatuses(): Observable<string[]> {
    return this.http.getStatuses();
  }

  getSettings(): Observable<QuotationSettings> {
    return this.http.getSettings();
  }

  updateSettings(settings: QuotationSettings): Observable<QuotationSettings> {
    return this.http.updateSettings(settings);
  }

  getNextNumber(companyCode?: string): Observable<QuotationNextNumber> {
    return this.http.getNextNumber(companyCode);
  }

  getById(id: number): Observable<QuotationUpsertDto | null> {
    return this.http.getById(id);
  }

  create(body: QuotationUpsertDto): Observable<QuotationUpsertDto> {
    return this.http.create(body);
  }

  update(id: number, body: QuotationUpsertDto): Observable<QuotationUpsertDto> {
    return this.http.update(id, body);
  }

  duplicate(id: number): Observable<QuotationUpsertDto> {
    return this.http.duplicate(id);
  }

  delete(id: number): Observable<void> {
    return this.http.delete(id);
  }

  patchStatus(id: number, status: string): Observable<QuotationUpsertDto> {
    return this.http.patchStatus(id, status);
  }
}

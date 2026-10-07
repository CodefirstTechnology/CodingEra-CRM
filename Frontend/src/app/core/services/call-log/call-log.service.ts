import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface CallLogRow {
  callId: number;
  direction: string;
  phoneNumber: string;
  contactCompany: string;
  contactName: string;
  callStarted: string;
  durationMinutes: number;
  durationSeconds: number;
  outcome: string;
  summary?: string | null;
  contactId?: number | null;
  relatedLeadId?: number | null;
  relatedDealId?: number | null;
  isActive?: boolean;
  createdAt?: string;
  createdBy?: number | null;
}

export interface CallLogUpsertPayload {
  callId?: number;
  direction?: string;
  phoneNumber?: string;
  contactCompany?: string;
  contactName?: string;
  callStarted?: string;
  durationMinutes?: number;
  durationSeconds?: number;
  outcome?: string;
  summary?: string | null;
  contactId?: number | null;
  relatedLeadId?: number | null;
  relatedDealId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class CallLogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/callLogs`;

  getCalls(userId: number | string = 1): Observable<CallLogRow[]> {
    const num = Number(userId);
    const validId = Number.isFinite(num) && num > 0 ? num : 1;
    return this.http.get<CallLogRow[]>(`${this.baseUrl}/GetCalls`, {
      params: { userId: String(validId) },
    });
  }

  getForLead(leadId: number, userId: number | string = 1): Observable<CallLogRow[]> {
    return this.getCalls(userId).pipe(
      map((rows) => (rows || []).filter((r) => r.relatedLeadId === leadId)),
    );
  }

  addCall(payload: CallLogUpsertPayload, userId: number | string = 1): Observable<CallLogRow> {
    const num = Number(userId);
    const validId = Number.isFinite(num) && num > 0 ? num : 1;
    return this.http.post<CallLogRow>(`${this.baseUrl}/AddCall`, payload, {
      params: { userId: String(validId) },
    });
  }

  deleteCall(callId: number): Observable<string> {
    return this.http.delete(`${this.baseUrl}/DeleteCall/${callId}`, {
      responseType: 'text',
    });
  }
}

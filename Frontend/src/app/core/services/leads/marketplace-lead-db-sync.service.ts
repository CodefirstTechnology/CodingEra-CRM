import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import type { IndiaMartLead } from '../../../features/indiamartlead/indiamart-lead.model';
import type { JustdialLead } from '../../../features/justdiallead/justdial-lead.model';
import type { TradeIndiaLead } from '../../../features/tradeindialead/tradeindia-lead.model';
import { OrganizationResolveService } from '../organizations/organization-resolve.service';
import { LeadHttpService } from './lead-http.service';
import { LeadMasterDataService } from './lead-master-data.service';
import { LeadOwnerOptionsService } from './lead-owner-options.service';
import type { LeadNormalized, LeadUpsertDto } from './lead-api.models';
import {
  extractMarketplaceExternalRef,
  indiaMartLeadToUpsertDto,
  justdialLeadToUpsertDto,
  marketplaceLeadDedupeKey,
  marketplaceOrganizationNameFromUpsert,
  marketplaceTerritoryFromUpsert,
  type MarketplaceApiSource,
  tradeIndiaLeadToUpsertDto,
  withLeadStatusId,
} from './marketplace-lead-to-api.mapper';

export interface MarketplaceDbPersistResult {
  saved: number;
  skipped: number;
  failed: number;
  lastError?: string;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceLeadDbSyncService {
  private readonly leadHttp = inject(LeadHttpService);
  private readonly masterData = inject(LeadMasterDataService);
  private readonly orgResolve = inject(OrganizationResolveService);
  private readonly ownerOpts = inject(LeadOwnerOptionsService);

  enabled(): boolean {
    const flag = (environment as { persistMarketplaceLeadsToDb?: boolean }).persistMarketplaceLeadsToDb;
    if (flag === false) return false;
    return !!environment.apiUrl?.trim();
  }

  persistIndiaMartLeads(leads: readonly IndiaMartLead[]): Observable<MarketplaceDbPersistResult> {
    return this.persistLeads(
      'IndiaMART',
      leads.map((l) => indiaMartLeadToUpsertDto(l)),
      leads.map((l) => marketplaceLeadDedupeKey('IndiaMART', l)),
    );
  }

  persistJustdialLeads(leads: readonly JustdialLead[]): Observable<MarketplaceDbPersistResult> {
    return this.persistLeads(
      'Justdial',
      leads.map((l) => justdialLeadToUpsertDto(l)),
      leads.map((l) => marketplaceLeadDedupeKey('Justdial', l)),
    );
  }

  persistTradeIndiaLeads(leads: readonly TradeIndiaLead[]): Observable<MarketplaceDbPersistResult> {
    return this.persistLeads(
      'TradeIndia',
      leads.map((l) => tradeIndiaLeadToUpsertDto(l)),
      leads.map((l) => marketplaceLeadDedupeKey('TradeIndia', l)),
    );
  }

  private persistLeads(
    source: MarketplaceApiSource,
    bodies: LeadUpsertDto[],
    incomingKeys: string[],
  ): Observable<MarketplaceDbPersistResult> {
    if (!this.enabled() || bodies.length === 0) {
      return of({ saved: 0, skipped: bodies.length, failed: 0 });
    }

    return this.ownerOpts.ensureLoaded().pipe(
      switchMap(() =>
        forkJoin({
          statusMap: this.masterData.loadLeadStatusIds(),
          existing: this.leadHttp.list(),
          orgsReady: this.orgResolve.preload(),
        }),
      ),
      switchMap(({ statusMap, existing }) => {
        const existingKeys = this.buildExistingKeySet(source, existing);
        const toCreate: LeadUpsertDto[] = [];
        let skipped = 0;
        let prepFailed = 0;
        let lastError: string | undefined;

        for (let i = 0; i < bodies.length; i++) {
          const key = incomingKeys[i] ?? '';
          if (key && existingKeys.has(key)) {
            skipped++;
            continue;
          }
          const raw = bodies[i];
          const statusId = this.masterData.resolveLeadStatusId(raw.status ?? 'New', statusMap);
          if (statusId == null) {
            lastError = 'No lead status id found. Add active rows in Master Data → Lead statuses.';
            prepFailed++;
            continue;
          }
          const enriched = withLeadStatusId(raw, statusId);
          if (!enriched.email?.trim() && !enriched.mobile?.trim()) {
            lastError = 'Lead requires email or mobile for API save.';
            prepFailed++;
            continue;
          }
          toCreate.push(enriched);
          if (key) existingKeys.add(key);
        }

        if (toCreate.length === 0) {
          return of({ saved: 0, skipped, failed: prepFailed, lastError });
        }

        return from(toCreate).pipe(
          concatMap((body) =>
            this.prepareBodyForCreate(source, body).pipe(
              switchMap((prepared) =>
                this.leadHttp.create(prepared).pipe(
                  map(() => ({ ok: true as const })),
                  catchError((err: unknown) => {
                    lastError = this.formatPersistError(err);
                    console.warn(`[${source}] failed to save lead to API`, lastError, prepared);
                    return of({ ok: false as const });
                  }),
                ),
              ),
            ),
          ),
          toArray(),
          map((results) => ({
            saved: results.filter((r) => r.ok).length,
            skipped,
            failed: prepFailed + results.filter((r) => !r.ok).length,
            lastError,
          })),
        );
      }),
      catchError((err) => {
        const lastError = this.formatPersistError(err);
        console.warn(`[${source}] marketplace DB sync setup failed`, lastError);
        return of({ saved: 0, skipped: 0, failed: bodies.length, lastError });
      }),
    );
  }


  private formatPersistError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
      if (body && typeof body === 'object') {
        const o = body as Record<string, unknown>;
        const errors = o['errors'];
        if (errors && typeof errors === 'object') {
          const parts: string[] = [];
          for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
            if (Array.isArray(messages)) {
              parts.push(`${field}: ${messages.map(String).join(', ')}`);
            }
          }
          if (parts.length) return parts.join('; ').slice(0, 300);
        }
        for (const k of ['title', 'detail', 'message']) {
          const v = o[k];
          if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300);
        }
      }
      return `HTTP ${err.status}`;
    }
    if (err instanceof Error) return err.message;
    return 'Request failed';
  }

  /** IndiaMART leads: `requirement` only, no organization FK. Other marketplaces resolve org from product/city. */
  private prepareBodyForCreate(source: MarketplaceApiSource, body: LeadUpsertDto) {
    if (source === 'IndiaMART') {
      return of({ ...body, organizationId: null });
    }
    return this.attachOrganizationId(body);
  }

  private attachOrganizationId(body: LeadUpsertDto) {
    const name = marketplaceOrganizationNameFromUpsert(body);
    const territory = marketplaceTerritoryFromUpsert(body);
    return this.orgResolve.ensureOrganizationId(name, { territory, industry: 'Other' }).pipe(
      map((organizationId) =>
        organizationId != null && organizationId > 0 ? { ...body, organizationId } : body,
      ),
    );
  }

  private buildExistingKeySet(
    source: MarketplaceApiSource,
    rows: LeadNormalized[],
  ): Set<string> {
    const keys = new Set<string>();
    for (const row of rows) {
      const fromNotes = extractMarketplaceExternalRef(row.notes);
      if (fromNotes?.source === source && fromNotes.key) {
        keys.add(`${source}|ext:${fromNotes.key}`);
      }
    }
    return keys;
  }
}

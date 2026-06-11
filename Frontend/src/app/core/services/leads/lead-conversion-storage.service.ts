import { Injectable } from '@angular/core';
import type { DealRow } from '../../../features/deals/deals.component';
import type { LeadRow } from '../../../features/leads/lead-row.model';
import { CONVERTED_LEAD_STATUS_NAME } from './lead-status.constants';
import { LEAD_CONVERSION_DEAL_SOURCE } from './lead-conversion.types';
import {
  applyDealConversionInference,
  buildLeadDealConversionIndex,
  normalizeLeadRecordId,
  type LeadDealConversionIndex,
} from '../../../shared/utils/lead-conversion.util';

const STORAGE_KEY = 'crm.leadConversions.v1';

interface LeadConversionLink {
  isConverted: boolean;
  convertedDealId: string;
  convertedAt: string;
}

interface DealConversionLink {
  sourceLeadId: string;
  source: typeof LEAD_CONVERSION_DEAL_SOURCE;
}

interface ConversionStore {
  leads: Record<string, LeadConversionLink>;
  deals: Record<string, DealConversionLink>;
}

@Injectable({ providedIn: 'root' })
export class LeadConversionStorageService {
  private readStore(): ConversionStore {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { leads: {}, deals: {} };
      const parsed = JSON.parse(raw) as Partial<ConversionStore>;
      return {
        leads: parsed.leads && typeof parsed.leads === 'object' ? parsed.leads : {},
        deals: parsed.deals && typeof parsed.deals === 'object' ? parsed.deals : {},
      };
    } catch {
      return { leads: {}, deals: {} };
    }
  }

  private writeStore(store: ConversionStore): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* quota / private mode */
    }
  }

  recordConversion(args: { leadId: string; dealId: string; convertedAt: string }): void {
    const store = this.readStore();
    const leadId = normalizeLeadRecordId(args.leadId);
    const dealId = normalizeLeadRecordId(args.dealId);
    store.leads[leadId] = {
      isConverted: true,
      convertedDealId: dealId,
      convertedAt: args.convertedAt,
    };
    store.deals[dealId] = {
      sourceLeadId: leadId,
      source: LEAD_CONVERSION_DEAL_SOURCE,
    };
    this.writeStore(store);
  }

  getLeadLink(leadId: string): LeadConversionLink | null {
    return this.readStore().leads[normalizeLeadRecordId(leadId)] ?? null;
  }

  getDealLink(dealId: string): DealConversionLink | null {
    return this.readStore().deals[dealId] ?? null;
  }

  enrichLeadRow(row: LeadRow): LeadRow {
    const link = this.getLeadLink(row.id);
    if (link) {
      return {
        ...row,
        isConverted: true,
        convertedDealId: link.convertedDealId,
        convertedAt: link.convertedAt,
        status:
          row.status === CONVERTED_LEAD_STATUS_NAME ? row.status : CONVERTED_LEAD_STATUS_NAME,
      };
    }

    const dealLink = this.findDealLinkForLead(row.id);
    if (dealLink) {
      return {
        ...row,
        isConverted: true,
        convertedDealId: dealLink.dealId,
        convertedAt: dealLink.convertedAt,
        status:
          row.status === CONVERTED_LEAD_STATUS_NAME ? row.status : CONVERTED_LEAD_STATUS_NAME,
      };
    }

    if (row.status === CONVERTED_LEAD_STATUS_NAME) {
      return { ...row, isConverted: true };
    }
    return row;
  }

  private findDealLinkForLead(leadId: string): { dealId: string; convertedAt: string } | null {
    const store = this.readStore();
    const key = normalizeLeadRecordId(leadId);
    const leadLink = store.leads[key];
    for (const [dealId, link] of Object.entries(store.deals)) {
      if (normalizeLeadRecordId(link.sourceLeadId) === key) {
        return {
          dealId,
          convertedAt: leadLink?.convertedAt ?? '',
        };
      }
    }
    return null;
  }

  enrichLeadRowWithDeals(
    row: LeadRow,
    index: LeadDealConversionIndex | null | undefined,
  ): LeadRow {
    return applyDealConversionInference(this.enrichLeadRow(row), index);
  }

  enrichLeadRowsWithDeals(rows: LeadRow[], deals: readonly DealRow[]): LeadRow[] {
    const index = buildLeadDealConversionIndex(deals);
    return rows.map((row) => this.enrichLeadRowWithDeals(row, index));
  }

  enrichDealRow(row: DealRow): DealRow {
    const link = this.getDealLink(row.id);
    if (!link) return row;
    return {
      ...row,
      sourceLeadId: link.sourceLeadId,
      source: link.source,
    };
  }

  enrichLeadRows(rows: LeadRow[]): LeadRow[] {
    return rows.map((r) => this.enrichLeadRow(r));
  }

  enrichDealRows(rows: DealRow[]): DealRow[] {
    return rows.map((r) => this.enrichDealRow(r));
  }
}

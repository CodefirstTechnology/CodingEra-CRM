import { Injectable } from '@angular/core';
import type { DealRow } from '../../../features/deals/deals.component';
import type { LeadRow } from '../../../features/leads/lead-row.model';

const STORAGE_KEY = 'crm.leadConversions.v1';

interface LeadConversionLink {
  isConverted: boolean;
  convertedDealId: string;
  convertedAt: string;
}

interface DealConversionLink {
  sourceLeadId: string;
  source: 'lead_conversion';
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
    store.leads[args.leadId] = {
      isConverted: true,
      convertedDealId: args.dealId,
      convertedAt: args.convertedAt,
    };
    store.deals[args.dealId] = {
      sourceLeadId: args.leadId,
      source: 'lead_conversion',
    };
    this.writeStore(store);
  }

  getLeadLink(leadId: string): LeadConversionLink | null {
    return this.readStore().leads[leadId] ?? null;
  }

  getDealLink(dealId: string): DealConversionLink | null {
    return this.readStore().deals[dealId] ?? null;
  }

  enrichLeadRow(row: LeadRow): LeadRow {
    const link = this.getLeadLink(row.id);
    if (!link) {
      if (row.status === 'Converted') {
        return { ...row, isConverted: true };
      }
      return row;
    }
    return {
      ...row,
      isConverted: true,
      convertedDealId: link.convertedDealId,
      convertedAt: link.convertedAt,
      status: row.status === 'Converted' ? row.status : 'Converted',
    };
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

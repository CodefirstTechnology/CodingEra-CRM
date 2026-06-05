import { inject, Injector, runInInjectionContext, type Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { LeadRow } from './lead-row.model';

export interface MarketplaceSyncResult {
  added: number;
  skippedDuplicates: number;
  dbSaved?: number;
  dbSkipped?: number;
  dbFailed?: number;
  lastError?: string;
}

export interface MarketplaceIntegrationRuntime {
  readonly pullInProgress: Signal<boolean>;
  readonly loading: Signal<boolean>;
  getConfigError(): string | null;
  getLocalLeadRows(): LeadRow[];
  fetchFromApi(): Observable<MarketplaceSyncResult>;
}

export interface LeadsMarketplaceRuntime {
  readonly indiamart?: MarketplaceIntegrationRuntime;
  readonly justdial?: MarketplaceIntegrationRuntime;
  readonly tradeindia?: MarketplaceIntegrationRuntime;
}

let runtimePromise: Promise<LeadsMarketplaceRuntime> | null = null;

export function resetLeadsMarketplaceRuntimeForTests(): void {
  runtimePromise = null;
}

/**
 * Loads IndiaMART / Justdial / TradeIndia integration code on demand.
 * Safe to call from sync handlers or deferred post-paint merge (not from module top-level).
 */
export function loadLeadsMarketplaceRuntime(injector: Injector): Promise<LeadsMarketplaceRuntime> {
  if (!runtimePromise) {
    runtimePromise = runInInjectionContext(injector, () => buildRuntime());
  }
  return runtimePromise;
}

async function buildRuntime(): Promise<LeadsMarketplaceRuntime> {
  const runtime: {
    indiamart?: MarketplaceIntegrationRuntime;
    justdial?: MarketplaceIntegrationRuntime;
    tradeindia?: MarketplaceIntegrationRuntime;
  } = {};

  if (environment.enableIndiamartLead) {
    const [svcMod, mapMod] = await Promise.all([
      import('../indiamartlead/indiamart-leads.service'),
      import('../indiamartlead/indiamart-lead.mapper'),
    ]);
    const svc = inject(svcMod.IndiamartLeadsService);
    runtime.indiamart = {
      pullInProgress: svc.pullInProgress,
      loading: svc.pullInProgress,
      getConfigError: () => svc.getLivePullConfigurationError(),
      getLocalLeadRows: () => svc.leads().map(mapMod.mapIndiaMartLeadToLeadRow),
      fetchFromApi: () => svc.fetchFromIndiaMartAPI(),
    };
  }

  if (environment.justdial.enabled) {
    const [svcMod, mapMod] = await Promise.all([
      import('../justdiallead/justdial-leads.service'),
      import('../justdiallead/justdial-lead.mapper'),
    ]);
    const svc = inject(svcMod.JustdialLeadsService);
    runtime.justdial = {
      pullInProgress: svc.loading,
      loading: svc.loading,
      getConfigError: () => null,
      getLocalLeadRows: () => svc.leads().map(mapMod.mapJustdialLeadToLeadRow),
      fetchFromApi: () => svc.fetchFromAPI(),
    };
  }

  if (environment.tradeindia.enabled) {
    const [svcMod, mapMod] = await Promise.all([
      import('../tradeindialead/tradeindia-leads.service'),
      import('../tradeindialead/tradeindia-lead.mapper'),
    ]);
    const svc = inject(svcMod.TradeIndiaLeadsService);
    runtime.tradeindia = {
      pullInProgress: svc.loading,
      loading: svc.loading,
      getConfigError: () => null,
      getLocalLeadRows: () => svc.leads().map(mapMod.mapTradeIndiaLeadToLeadRow),
      fetchFromApi: () => svc.fetchFromAPI(),
    };
  }

  return runtime as LeadsMarketplaceRuntime;
}

export function needsLocalMarketplaceMerge(): boolean {
  if (!hasAnyMarketplaceFeatureEnabled()) return false;
  const flag = (environment as { persistMarketplaceLeadsToDb?: boolean }).persistMarketplaceLeadsToDb;
  return flag === false || !environment.apiUrl?.trim();
}

/** True when any marketplace integration flag is on (local merge may apply). */
export function hasAnyMarketplaceFeatureEnabled(): boolean {
  return (
    environment.enableIndiamartLead ||
    environment.justdial.enabled ||
    environment.tradeindia.enabled
  );
}

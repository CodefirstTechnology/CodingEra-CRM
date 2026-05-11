import type { IndiamartEnvironmentConfig } from './indiamart-environment';
import { indiamartSecrets, justdialSecrets } from './indiamart-secrets.generated';

export const environment = {
  production: false,
  /**
   * Set to `true` to show IndiaMART Leads in the admin sidebar and enable `/dashboard/indiamart-leads`.
   * Set to `false` to hide it completely (direct URLs redirect to `/dashboard`).
   */
  enableIndiamartLead: true,
  /**
   * Demo auto-append (localStorage). Only runs when `indiamart.useMock` is true.
   * Set to `0` while using real IndiaMART API only.
   */
  indiamartAutoSimulateIntervalMs: 0,
  /**
   * After this many ms from opening the Leads page, auto-simulation stops and clears IndiaMART rows.
   * N/A when `indiamartAutoSimulateIntervalMs` is `0`.
   */
  indiamartAutoSimulateDurationMs: 0,
  useMockData: true,
  apiUrl: '/api',
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  showLeadConvertSuccessMessage: false,
  /**
   * Lead Manager **Pull API** only: `…/wservce/crm/crmListing/v2` + query `glusr_crm_key`.
   * Generate key: seller.indiamart.com → Lead Manager → Import/Export → Pull API (or /leadmanager/crmapi).
   * Dev uses `/indiamart-mapi/…` + `proxy.conf.json` (restart `ng serve` after changing proxy).
   * Do not use old `…/enquiry/listing/GLUSR_MOBILE/…` URLs — they 404/503. Max one sync per 5 minutes.
   */
  indiamart: {
    useMock: false,
    pullApiUrl: indiamartSecrets.pullApiUrl || '/indiamart-mapi/wservce/crm/crmListing/v2',
    pushApiUrl: indiamartSecrets.pushApiUrl,
    /** Same Pull API key as production `environment.ts` — keep in sync or use a local-only key. */
    apiKey: indiamartSecrets.apiKey,
    webhookToken: indiamartSecrets.webhookToken,
  } satisfies IndiamartEnvironmentConfig,
  justdial: {
    enabled: justdialSecrets.enabled,
    useMock: justdialSecrets.useMock,
    pullApiUrl: justdialSecrets.pullApiUrl,
    apiKey: justdialSecrets.apiKey,
    webhookToken: justdialSecrets.webhookToken,
  },
};

import type { IndiamartEnvironmentConfig } from './indiamart-environment';

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
  /** Local .NET API (dev): `{apiUrl}/auth/login`, `/auth/register`, `/auth/users`, `/auth/users/{id}` */
  apiUrl: 'https://localhost:7172/api',
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
    pullApiUrl: '/indiamart-mapi/wservce/crm/crmListing/v2',
    pushApiUrl: '',
    /** Same Pull API key as production `environment.ts` — keep in sync or use a local-only key. */
    apiKey: '',
    webhookToken: '',
  } satisfies IndiamartEnvironmentConfig,
};

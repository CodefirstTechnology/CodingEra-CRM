import type { IndiamartEnvironmentConfig } from './indiamart-environment';
import {
  indiamartSecrets,
  justdialSecrets,
  tradeindiaSecrets,
} from './indiamart-secrets.generated';

export const environment = {
  production: true,
  /**
   * Set to `true` to show IndiaMART Leads in the admin sidebar and enable `/dashboard/indiamart-leads`.
   * Set to `false` to hide it completely (direct URLs redirect to `/dashboard`).
   */
  enableIndiamartLead: true,
  /**
   * Milliseconds between auto-appended demo IndiaMART leads (localStorage + Leads list).
   * Set to `0` to disable. Only runs when `enableIndiamartLead` is true and `indiamart.useMock` is true.
   */
  indiamartAutoSimulateIntervalMs: 4 * 60 * 1000,
  /**
   * After this many ms from opening the Leads page, auto-simulation stops and all IndiaMART leads are cleared.
   * Set to `0` to run until you leave the page (no auto-clear).
   */
  indiamartAutoSimulateDurationMs: 60 * 60 * 1000,
  useMockData: true,
  /** When true with `useMockData`, only call logs use `apiUrl`; set true in dev to hit the DB-backed call log API. */
  useLiveCallLogsApi: false,
  apiUrl: '/api',
  /** After lead → deal: `'mark-converted'` sets lead status to Converted; `'delete'` removes the lead. */
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  /** If true, shows `window.alert` after a successful convert (no new UI components). */
  showLeadConvertSuccessMessage: false,
  /**
   * Lead Manager Pull API — use a reverse proxy in production (browser cannot call mapi directly).
   */
  indiamart: {
    useMock: false,
    pullApiUrl:
      indiamartSecrets.pullApiUrl || 'https://mapi.indiamart.com/wservce/crm/crmListing/v2',
    pushApiUrl: indiamartSecrets.pushApiUrl,
    apiKey: indiamartSecrets.apiKey,
    webhookToken: indiamartSecrets.webhookToken,
  } satisfies IndiamartEnvironmentConfig,
  /**
   * Justdial should be routed through a backend/proxy before real production use.
   * Keep secrets out of frontend production builds; mock mode is enabled until that API exists.
   */
  justdial: {
    enabled: justdialSecrets.enabled,
    useMock: justdialSecrets.useMock,
    pullApiUrl: justdialSecrets.pullApiUrl,
    apiKey: justdialSecrets.apiKey,
    webhookToken: justdialSecrets.webhookToken,
  },
  tradeindia: {
    enabled: tradeindiaSecrets.enabled,
    useMock: tradeindiaSecrets.useMock,
    pullApiUrl: tradeindiaSecrets.pullApiUrl,
    apiKey: tradeindiaSecrets.apiKey,
    webhookToken: tradeindiaSecrets.webhookToken,
  },
};

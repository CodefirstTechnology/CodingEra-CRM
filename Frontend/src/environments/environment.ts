import type { IndiamartEnvironmentConfig } from './indiamart-environment';
import {
  indiamartSecrets,
  justdialSecrets,
  tradeindiaSecrets,
} from './indiamart-secrets.generated';

export const environment = {
  production: true,
  apiQueryUserIdFallback: undefined as string | undefined,
  /**
   * Set to `true` to show IndiaMART Leads in the admin sidebar and enable `/dashboard/indiamart-leads`.
   * Set to `false` to hide it completely (direct URLs redirect to `/dashboard`).
   */
  enableIndiamartLead: true,
  apiUrl: '/api',
  persistMarketplaceLeadsToDb: true,
  marketplaceLeadSourceForApi: 'Website',
  /** After lead → deal: `'mark-converted'` sets lead status to Converted; `'delete'` removes the lead. */
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  /** If true, shows `window.alert` after a successful convert (no new UI components). */
  showLeadConvertSuccessMessage: false,
  /**
   * Lead Manager Pull API — use a reverse proxy in production (browser cannot call mapi directly).
   */
  indiamart: {
    pullApiUrl:
      indiamartSecrets.pullApiUrl || '/indiamart-mapi/wservce/crm/crmListing/v2',
    pushApiUrl: indiamartSecrets.pushApiUrl,
    apiKey: indiamartSecrets.apiKey,
    webhookToken: indiamartSecrets.webhookToken,
  } satisfies IndiamartEnvironmentConfig,
  /**
   * Justdial should be routed through a backend/proxy before real production use.
   */
  justdial: {
    enabled: justdialSecrets.enabled,
    pullApiUrl: justdialSecrets.pullApiUrl,
    apiKey: justdialSecrets.apiKey,
    webhookToken: justdialSecrets.webhookToken,
  },
  tradeindia: {
    enabled: tradeindiaSecrets.enabled,
    pullApiUrl: tradeindiaSecrets.pullApiUrl,
    apiKey: tradeindiaSecrets.apiKey,
    webhookToken: tradeindiaSecrets.webhookToken,
  },
};

/**
 * Production environment mirror for reference and optional tooling imports.
 * The default Angular production build uses `environment.ts` (see `angular.json`).
 * Keep `indiamart` and other flags aligned with `environment.ts` when you change prod values.
 */
import type { IndiamartEnvironmentConfig } from './indiamart-environment';
import {
  indiamartSecrets,
  justdialSecrets,
  tradeindiaSecrets,
} from './indiamart-secrets.generated';

export const environment = {
  production: true,
  enableIndiamartLead: true,
  apiUrl: '/api',
  persistMarketplaceLeadsToDb: true,
  marketplaceLeadSourceForApi: 'Website',
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  showLeadConvertSuccessMessage: false,
  indiamart: {
    pullApiUrl:
      indiamartSecrets.pullApiUrl || '/indiamart-mapi/wservce/crm/crmListing/v2',
    pushApiUrl: indiamartSecrets.pushApiUrl,
    apiKey: indiamartSecrets.apiKey,
    webhookToken: indiamartSecrets.webhookToken,
  } satisfies IndiamartEnvironmentConfig,
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

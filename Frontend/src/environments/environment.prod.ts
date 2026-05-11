/**
 * Production environment mirror for reference and optional tooling imports.
 * The default Angular production build uses `environment.ts` (see `angular.json`).
 * Keep `indiamart` and other flags aligned with `environment.ts` when you change prod values.
 */
import type { IndiamartEnvironmentConfig } from './indiamart-environment';
import { indiamartSecrets } from './indiamart-secrets.generated';

export const environment = {
  production: true,
  enableIndiamartLead: true,
  indiamartAutoSimulateIntervalMs: 4 * 60 * 1000,
  indiamartAutoSimulateDurationMs: 60 * 60 * 1000,
  useMockData: false,
  apiUrl: '/api',
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  showLeadConvertSuccessMessage: false,
  indiamart: {
    useMock: false,
    pullApiUrl:
      indiamartSecrets.pullApiUrl || 'https://mapi.indiamart.com/wservce/crm/crmListing/v2',
    pushApiUrl: indiamartSecrets.pushApiUrl,
    apiKey: indiamartSecrets.apiKey,
    webhookToken: indiamartSecrets.webhookToken,
  } satisfies IndiamartEnvironmentConfig,
  justdial: {
    enabled: true,
    useMock: true,
    pullApiUrl: '',
    apiKey: '',
    webhookToken: '',
  },
};

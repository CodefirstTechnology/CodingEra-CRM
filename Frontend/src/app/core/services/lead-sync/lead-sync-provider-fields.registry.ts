export type LeadSyncCredentialFieldType = 'url' | 'password' | 'text';

export interface LeadSyncCredentialFieldDef {
  key: string;
  label: string;
  hint?: string;
  type: LeadSyncCredentialFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface LeadSyncProviderUiDef {
  connectionTitle: string;
  connectionDescription: string;
  fields: LeadSyncCredentialFieldDef[];
}

const INDIA_MART_PULL_URL = 'https://mapi.indiamart.com/wservce/crm/crmListing/v2';

/** UI field definitions keyed by backend `lead_sync_sources.code`. */
export const LEAD_SYNC_PROVIDER_UI: Record<string, LeadSyncProviderUiDef> = {
  indiamart: {
    connectionTitle: 'IndiaMART API connection',
    connectionDescription:
      'Use your Lead Manager Pull API key from seller.indiamart.com → Lead Manager → Import/Export.',
    fields: [
      {
        key: 'pullApiUrl',
        label: 'Lead pull API URL',
        hint: 'Official IndiaMART CRM listing endpoint.',
        type: 'url',
        required: true,
        placeholder: INDIA_MART_PULL_URL,
        defaultValue: INDIA_MART_PULL_URL,
      },
      {
        key: 'apiKey',
        label: 'CRM API key (glusr_crm_key)',
        hint: 'Leave blank when updating other fields to keep the saved key.',
        type: 'password',
        required: true,
        placeholder: 'Paste your IndiaMART CRM key',
      },
    ],
  },
  tradeindia: {
    connectionTitle: 'TradeIndia API connection',
    connectionDescription:
      'Enter the pull endpoint and API key provided by TradeIndia or your integration partner.',
    fields: [
      {
        key: 'pullApiUrl',
        label: 'Lead pull API URL',
        type: 'url',
        required: true,
        placeholder: 'https://api.tradeindia.com/…',
      },
      {
        key: 'apiKey',
        label: 'API key / access token',
        hint: 'Leave blank when updating other fields to keep the saved key.',
        type: 'password',
        required: true,
        placeholder: 'Paste your TradeIndia API key',
      },
    ],
  },
  justdial: {
    connectionTitle: 'Justdial API connection',
    connectionDescription:
      'Enter the pull endpoint and API key provided by Justdial or your integration partner.',
    fields: [
      {
        key: 'pullApiUrl',
        label: 'Lead pull API URL',
        type: 'url',
        required: true,
        placeholder: 'https://api.justdial.com/…',
      },
      {
        key: 'apiKey',
        label: 'API key / access token',
        hint: 'Leave blank when updating other fields to keep the saved key.',
        type: 'password',
        required: true,
        placeholder: 'Paste your Justdial API key',
      },
    ],
  },
};

export function getLeadSyncProviderUi(code: string): LeadSyncProviderUiDef | null {
  return LEAD_SYNC_PROVIDER_UI[code.trim().toLowerCase()] ?? null;
}

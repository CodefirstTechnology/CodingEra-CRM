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
  connectionDescription?: string;
  fields: LeadSyncCredentialFieldDef[];
}

const INDIA_MART_PULL_URL = 'https://mapi.indiamart.com/wservce/crm/crmListing/v2';

/** UI field definitions keyed by backend `lead_sync_sources.code`. */
export const LEAD_SYNC_PROVIDER_UI: Record<string, LeadSyncProviderUiDef> = {
  indiamart: {
    connectionTitle: 'API connection',
    fields: [
      {
        key: 'pullApiUrl',
        label: 'Lead pull API URL',
        type: 'url',
        required: true,
        placeholder: INDIA_MART_PULL_URL,
        defaultValue: INDIA_MART_PULL_URL,
      },
      {
        key: 'apiKey',
        label: 'CRM API key',
        type: 'password',
        required: true,
        placeholder: 'Paste your IndiaMART CRM key',
      },
    ],
  },
  tradeindia: {
    connectionTitle: 'API connection',
    fields: [
      {
        key: 'pullApiUrl',
        label: 'Lead pull API URL',
        hint: 'Include userid and profile_id only. Do not put the API key in the URL.',
        type: 'url',
        required: true,
        placeholder: 'https://www.tradeindia.com/utils/my_inquiry.html?userid=…&profile_id=…',
      },
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        placeholder: 'Paste your TradeIndia API key',
      },
    ],
  },
  justdial: {
    connectionTitle: 'API connection',
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
        label: 'API key',
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

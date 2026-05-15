/**
 * IndiaMART integration config (URLs and credentials belong in environment files only).
 */
export interface IndiamartEnvironmentConfig {
  /**
   * Lead Manager Pull API base URL (no `glusr_crm_key` required here unless you embed it).
   * Docs: `https://mapi.indiamart.com/wservce/crm/crmListing/v2`
   */
  pullApiUrl: string;
  pushApiUrl: string;
  /** Pull API key → sent as query `glusr_crm_key` (seller.indiamart.com → Lead Manager → Pull API). */
  apiKey: string;
  webhookToken: string;
}

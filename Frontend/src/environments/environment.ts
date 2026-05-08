export const environment = {
  production: true,
  /**
   * Set to `true` to show IndiaMART Leads in the admin sidebar and enable `/dashboard/indiamart-leads`.
   * Set to `false` to hide it completely (direct URLs redirect to `/dashboard`).
   */
  enableIndiamartLead: true,
  /**
   * Milliseconds between auto-appended demo IndiaMART leads (localStorage + Leads list).
   * Set to `0` to disable. Only runs when `enableIndiamartLead` is true.
   */
  indiamartAutoSimulateIntervalMs: 30_000,
  useMockData: true,
  apiUrl: '/api',
  /** After lead → deal: `'mark-converted'` sets lead status to Converted; `'delete'` removes the lead. */
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  /** If true, shows `window.alert` after a successful convert (no new UI components). */
  showLeadConvertSuccessMessage: false,
};

export const environment = {
  production: false,
  /**
   * Set to `true` to show IndiaMART Leads in the admin sidebar and enable `/dashboard/indiamart-leads`.
   * Set to `false` to hide it completely (direct URLs redirect to `/dashboard`).
   */
  enableIndiamartLead: true,
  /**
   * Milliseconds between auto-appended demo IndiaMART leads (localStorage + Leads list).
   * Set to `0` to disable. Only runs when `enableIndiamartLead` is true.
   */
  indiamartAutoSimulateIntervalMs: 4 * 60 * 1000,
  /**
   * After this many ms from opening the Leads page, auto-simulation stops and all IndiaMART leads are cleared.
   * Set to `0` to run until you leave the page (no auto-clear).
   */
  indiamartAutoSimulateDurationMs: 60 * 60 * 1000,
  useMockData: true,
  apiUrl: '/api',
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  showLeadConvertSuccessMessage: false,
};

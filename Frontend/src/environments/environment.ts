export const environment = {
  production: true,
  useMockData: true,
  apiUrl: '/api',
  /** After lead → deal: `'mark-converted'` sets lead status to Converted; `'delete'` removes the lead. */
  leadConversionAfterDeal: 'mark-converted' as 'mark-converted' | 'delete',
  /** If true, shows `window.alert` after a successful convert (no new UI components). */
  showLeadConvertSuccessMessage: false,
};

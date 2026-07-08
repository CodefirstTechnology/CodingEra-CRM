/** Base intl-tel-input options (countries loaded dynamically from the library). */
const CRM_INTL_TEL_INIT_OPTIONS_BASE = {
  strictMode: true,
  formatAsYouType: true,
  nationalMode: true,
  /** Show an example placeholder for the selected country. */
  autoPlaceholder: 'aggressive' as const,
  validationNumberTypes: ['MOBILE'] as ['MOBILE'],
  /** Default to India (+91); dial code and rules still come from the library. */
  initialCountry: 'in' as const,
  fixDropdownWidth: true,
};

/**
 * Runtime options for intl-tel-input.
 * Appends the country list to `document.body` so it works inside modals with overflow hidden.
 */
export function getCrmIntlTelInitOptions() {
  return {
    ...CRM_INTL_TEL_INIT_OPTIONS_BASE,
    dropdownContainer: typeof document !== 'undefined' ? document.body : null,
  };
}

/** @deprecated Use {@link getCrmIntlTelInitOptions} for modal-safe dropdown behaviour. */
export const CRM_INTL_TEL_INIT_OPTIONS = CRM_INTL_TEL_INIT_OPTIONS_BASE;

/** Default input attributes for mobile number fields (visual styles live on `.crm-intl-tel-field` wrappers). */
export const CRM_INTL_TEL_INPUT_PROPS: Record<string, string> = {
  autocomplete: 'tel',
  inputmode: 'numeric',
  type: 'tel',
};

export function crmIntlTelInputProps(): Record<string, string> {
  return { ...CRM_INTL_TEL_INPUT_PROPS };
}

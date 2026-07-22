export interface CrmSearchableSelectOption {
  id: string;
  label: string;
  hint?: string;
  /** Full record from search — used to autofill without a second fetch. */
  meta?: unknown;
}

export const CRM_SEARCHABLE_SELECT_MIN_LENGTH = 2;
export const CRM_SEARCHABLE_SELECT_DEBOUNCE_MS = 300;

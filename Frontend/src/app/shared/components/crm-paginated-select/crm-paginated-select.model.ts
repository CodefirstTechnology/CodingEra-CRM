import type { MasterDataOption } from '../../../core/services/leads/lead-master-data.service';

export interface CrmPaginatedSelectOption {
  value: string;
  label: string;
}

export const CRM_PAGINATED_SELECT_PAGE_SIZE = 10;

export function masterDataToPaginatedOptions(
  options: readonly MasterDataOption[],
  emptyOption?: { value: string; label: string },
): CrmPaginatedSelectOption[] {
  const rows = options.map((o) => ({
    value: o.id > 0 ? String(o.id) : o.name,
    label: o.name.trim() || '—',
  }));
  return emptyOption ? [emptyOption, ...rows] : rows;
}

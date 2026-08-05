export type DealExportDatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DealExportColumnOption {
  key: string;
  label: string;
}

export interface DealExportFilterOption {
  id: string;
  label: string;
}

export interface DealExportRequest {
  status?: string;
  statusId?: number;
  dealOwnerId?: number;
  search?: string;
  datePreset?: DealExportDatePreset;
  fromDate?: string;
  toDate?: string;
  columns: DealExportColumnOption[];
}

export const DEAL_EXPORT_DATE_PRESETS: { id: DealExportDatePreset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom date range' },
];

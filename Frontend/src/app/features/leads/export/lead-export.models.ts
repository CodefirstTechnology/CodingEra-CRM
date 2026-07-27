export type LeadExportDatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface LeadExportColumnOption {
  key: string;
  label: string;
}

export interface LeadExportFilterOption {
  id: string;
  label: string;
}

export interface LeadExportRequest {
  leadSource?: string;
  status?: string;
  leadOwnerId?: number;
  search?: string;
  datePreset?: LeadExportDatePreset;
  fromDate?: string;
  toDate?: string;
  columns: LeadExportColumnOption[];
}

export const LEAD_EXPORT_DATE_PRESETS: { id: LeadExportDatePreset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom date range' },
];

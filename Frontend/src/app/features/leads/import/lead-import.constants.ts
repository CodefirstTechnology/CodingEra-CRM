/** Column headers for the lead import Excel template (row 1) — aligned with the create-lead form. */
export const LEAD_IMPORT_TEMPLATE_COLUMNS = [
  'Full Name',
  'Mobile',
  'Email',
  'Gender',
  'Organization',
  'No Of Employees',
  'Annual Revenue',
  'Website',
  'GSTIN',
  'Territory',
  'Industry',
  'Location',
  'Status',
  'Lead Owner',
  'Request Type',
  'Lead Date',
  'Requirement',
  'Additional Details',
] as const;

export type LeadImportTemplateColumn = (typeof LEAD_IMPORT_TEMPLATE_COLUMNS)[number];

/** Row 2 in downloadable templates — Required/Optional hints aligned with the create-lead form. */
export const LEAD_IMPORT_TEMPLATE_HINT_ROW = [
  'Required',
  'Optional',
  'Optional',
  'Optional',
  'Required',
  'Optional',
  'Optional',
  'Optional',
  'Optional',
  'Optional',
  'Required',
  'Optional',
  'Required',
  'Required',
  'Optional',
  'Optional',
  'Required',
  'Optional',
] as const;

export const LEAD_IMPORT_TEMPLATE_FILENAME = 'LeadImportTemplate.xlsx';
export const LEAD_IMPORT_TEMPLATE_CSV_FILENAME = 'LeadImportTemplate.csv';

export const LEAD_IMPORT_ACCEPT =
  '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

export function isLeadImportXlsxFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.xlsx')) return true;
  const type = file.type.trim().toLowerCase();
  return (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel'
  );
}

export function isLeadImportCsvFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.csv')) return true;
  const type = file.type.trim().toLowerCase();
  return type === 'text/csv' || type === 'application/csv';
}

export function isLeadImportFile(file: File): boolean {
  return isLeadImportXlsxFile(file) || isLeadImportCsvFile(file);
}

export const LEAD_IMPORT_UNSUPPORTED_FILE_MESSAGE =
  'Only .xlsx and .csv files are supported.';

export const LEAD_IMPORT_ERRORS_FILENAME = 'ImportErrors.xlsx';

/** Rows processed per UI yield when parsing/mapping large uploads. */
export const LEAD_IMPORT_CHUNK_SIZE = 500;

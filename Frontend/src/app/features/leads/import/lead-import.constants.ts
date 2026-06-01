/** Column headers for the lead import Excel template (row 1). */
export const LEAD_IMPORT_TEMPLATE_COLUMNS = [
  'Salutation',
  'First Name',
  'Last Name',
  'Mobile',
  'Email',
  'Organization',
  'Industry',
  'No Of Employees',
  'Annual Revenue',
  'Website',
  'Territory',
  'Status',
  'Lead Owner',
  'Request Type',
  'Requirement',
  'Additional Details',
] as const;

export type LeadImportTemplateColumn = (typeof LEAD_IMPORT_TEMPLATE_COLUMNS)[number];

export const LEAD_IMPORT_TEMPLATE_FILENAME = 'lead-import-template.xlsx';

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

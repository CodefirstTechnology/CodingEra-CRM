/** Column headers for the contact import Excel template (row 1) — aligned with the create-contact form. */
export const CONTACT_IMPORT_TEMPLATE_COLUMNS = [
  'First Name',
  'Last Name',
  'Email',
  'Mobile',
  'Gender',
  'Company Name',
  'Designation',
  'Address',
] as const;

export type ContactImportTemplateColumn = (typeof CONTACT_IMPORT_TEMPLATE_COLUMNS)[number];

/** Row 2 in downloadable templates — Required/Optional hints aligned with the create-contact form. */
export const CONTACT_IMPORT_TEMPLATE_HINT_ROW = [
  'Required',
  'Required',
  'Optional',
  'Required',
  'Optional',
  'Optional',
  'Optional',
  'Optional',
] as const;

export const CONTACT_IMPORT_TEMPLATE_FILENAME = 'ContactImportTemplate.xlsx';
export const CONTACT_IMPORT_TEMPLATE_CSV_FILENAME = 'ContactImportTemplate.csv';

export const CONTACT_IMPORT_ACCEPT =
  '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

export function isContactImportXlsxFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.xlsx')) return true;
  const type = file.type.trim().toLowerCase();
  return (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel'
  );
}

export function isContactImportCsvFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.csv')) return true;
  const type = file.type.trim().toLowerCase();
  return type === 'text/csv' || type === 'application/csv';
}

export function isContactImportFile(file: File): boolean {
  return isContactImportXlsxFile(file) || isContactImportCsvFile(file);
}

export const CONTACT_IMPORT_UNSUPPORTED_FILE_MESSAGE =
  'Only .xlsx and .csv files are supported.';

export const CONTACT_IMPORT_ERRORS_FILENAME = 'ImportErrors.xlsx';

/** Rows processed per UI yield when parsing/mapping large uploads. */
export const CONTACT_IMPORT_CHUNK_SIZE = 500;

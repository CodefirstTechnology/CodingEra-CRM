import { LEAD_IMPORT_ERRORS_FILENAME } from './lead-import.constants';
import { loadLeadImportXlsx } from './lead-import-xlsx.lib';
import type { LeadImportRowError } from './lead-import-api.models';

export interface ImportErrorSheetRow {
  rowNumber: number;
  errorMessage: string;
}

/** Flattens API validation errors to one sheet row per error message. */
export function flattenImportErrors(errors: readonly LeadImportRowError[]): ImportErrorSheetRow[] {
  const rows: ImportErrorSheetRow[] = [];
  for (const entry of errors) {
    const messages = entry.errors?.length ? entry.errors : ['Unknown error'];
    for (const message of messages) {
      const trimmed = message.trim();
      if (!trimmed) continue;
      rows.push({
        rowNumber: entry.rowNumber,
        errorMessage: trimmed,
      });
    }
  }
  rows.sort((a, b) => a.rowNumber - b.rowNumber || a.errorMessage.localeCompare(b.errorMessage));
  return rows;
}

/** Builds and downloads `ImportErrors.xlsx` with Row Number and Error Message columns. */
export async function downloadImportErrorsXlsx(
  errors: readonly LeadImportRowError[],
  filename = LEAD_IMPORT_ERRORS_FILENAME,
): Promise<void> {
  const XLSX = await loadLeadImportXlsx();
  const flat = flattenImportErrors(errors);
  const header: (string | number)[] = ['Row Number', 'Error Message'];
  const data = flat.map((row) => [row.rowNumber, row.errorMessage]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  sheet['!cols'] = [{ wch: 12 }, { wch: 48 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Import Errors');
  XLSX.writeFile(workbook, filename);
}

export function hasImportErrors(errors: readonly LeadImportRowError[] | undefined): boolean {
  return flattenImportErrors(errors ?? []).length > 0;
}

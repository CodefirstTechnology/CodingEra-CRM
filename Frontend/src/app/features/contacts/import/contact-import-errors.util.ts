import { CONTACT_IMPORT_ERRORS_FILENAME } from './contact-import.constants';
import { loadLeadImportXlsx } from '../../leads/import/lead-import-xlsx.lib'; // Reuse
import type { ContactImportRowError } from './contact-import-api.models';

export interface ContactImportErrorSheetRow {
  rowNumber: number;
  errorMessage: string;
}

/** Flattens API validation errors to one sheet row per error message. */
export function flattenImportErrors(errors: readonly ContactImportRowError[]): ContactImportErrorSheetRow[] {
  const rows: ContactImportErrorSheetRow[] = [];
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
  errors: readonly ContactImportRowError[],
  filename = CONTACT_IMPORT_ERRORS_FILENAME,
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

export function hasImportErrors(errors: readonly ContactImportRowError[] | undefined): boolean {
  return flattenImportErrors(errors ?? []).length > 0;
}

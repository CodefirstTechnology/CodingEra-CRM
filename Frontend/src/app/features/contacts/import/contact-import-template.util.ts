import {
  CONTACT_IMPORT_TEMPLATE_COLUMNS,
  CONTACT_IMPORT_TEMPLATE_CSV_FILENAME,
  CONTACT_IMPORT_TEMPLATE_FILENAME,
  CONTACT_IMPORT_TEMPLATE_HINT_ROW,
} from './contact-import.constants';
import { loadLeadImportXlsx } from '../../leads/import/lead-import-xlsx.lib'; // Reuse

/** Builds and triggers download of the contact import `.xlsx` template (headers + hint row). */
export async function downloadContactImportTemplate(): Promise<void> {
  const XLSX = await loadLeadImportXlsx();
  const sheet = XLSX.utils.aoa_to_sheet([
    CONTACT_IMPORT_TEMPLATE_COLUMNS.slice(),
    CONTACT_IMPORT_TEMPLATE_HINT_ROW.slice(),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts');

  const colWidths = CONTACT_IMPORT_TEMPLATE_COLUMNS.map((label) => ({
    wch: Math.max(label.length + 2, 14),
  }));
  sheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, CONTACT_IMPORT_TEMPLATE_FILENAME);
}

/** Builds and triggers download of the contact import `.csv` template (headers + hint row, UTF-8). */
export function downloadContactImportCsvTemplate(): void {
  const lines = [
    CONTACT_IMPORT_TEMPLATE_COLUMNS.join(','),
    CONTACT_IMPORT_TEMPLATE_HINT_ROW.join(','),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = CONTACT_IMPORT_TEMPLATE_CSV_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

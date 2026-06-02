import {
  LEAD_IMPORT_TEMPLATE_COLUMNS,
  LEAD_IMPORT_TEMPLATE_CSV_FILENAME,
  LEAD_IMPORT_TEMPLATE_FILENAME,
  LEAD_IMPORT_TEMPLATE_HINT_ROW,
} from './lead-import.constants';
import { loadLeadImportXlsx } from './lead-import-xlsx.lib';

/** Builds and triggers download of the lead import `.xlsx` template (headers + hint row). */
export async function downloadLeadImportTemplate(): Promise<void> {
  const XLSX = await loadLeadImportXlsx();
  const sheet = XLSX.utils.aoa_to_sheet([
    LEAD_IMPORT_TEMPLATE_COLUMNS.slice(),
    LEAD_IMPORT_TEMPLATE_HINT_ROW.slice(),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Leads');

  const colWidths = LEAD_IMPORT_TEMPLATE_COLUMNS.map((label) => ({
    wch: Math.max(label.length + 2, 14),
  }));
  sheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, LEAD_IMPORT_TEMPLATE_FILENAME);
}

/** Builds and triggers download of the lead import `.csv` template (headers + hint row, UTF-8). */
export function downloadLeadImportCsvTemplate(): void {
  const lines = [
    LEAD_IMPORT_TEMPLATE_COLUMNS.join(','),
    LEAD_IMPORT_TEMPLATE_HINT_ROW.join(','),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = LEAD_IMPORT_TEMPLATE_CSV_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

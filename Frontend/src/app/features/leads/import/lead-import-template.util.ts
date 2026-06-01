import * as XLSX from 'xlsx';
import {
  LEAD_IMPORT_TEMPLATE_COLUMNS,
  LEAD_IMPORT_TEMPLATE_CSV_FILENAME,
  LEAD_IMPORT_TEMPLATE_FILENAME,
} from './lead-import.constants';

/** Builds and triggers download of the lead import `.xlsx` template (headers only). */
export function downloadLeadImportTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([LEAD_IMPORT_TEMPLATE_COLUMNS.slice()]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Leads');

  const colWidths = LEAD_IMPORT_TEMPLATE_COLUMNS.map((label) => ({
    wch: Math.max(label.length + 2, 14),
  }));
  sheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, LEAD_IMPORT_TEMPLATE_FILENAME);
}

/** Builds and triggers download of the lead import `.csv` template (headers only, UTF-8). */
export function downloadLeadImportCsvTemplate(): void {
  const header = LEAD_IMPORT_TEMPLATE_COLUMNS.join(',');
  const blob = new Blob(['\uFEFF' + header + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = LEAD_IMPORT_TEMPLATE_CSV_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

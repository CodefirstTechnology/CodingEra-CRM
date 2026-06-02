/** Lazy-loaded `xlsx` (SheetJS) — only fetched when import/export runs. */
type XlsxModule = typeof import('xlsx');

let xlsxModulePromise: Promise<XlsxModule> | null = null;

export function loadLeadImportXlsx(): Promise<XlsxModule> {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

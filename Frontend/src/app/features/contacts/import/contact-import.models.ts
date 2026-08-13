/** One parsed data row from an uploaded import workbook. */
export interface ContactImportParsedRow {
  /** 1-based Excel row number (header is row 1). */
  rowNumber: number;
  /** Column header → cell text. */
  values: Record<string, string>;
}

export interface ContactImportSummary {
  totalRows: number;
  parsedRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
}

export interface ContactImportParseResult {
  columns: string[];
  rows: ContactImportParsedRow[];
  summary: ContactImportSummary;
}

export type ContactImportProgressPhase = 'reading' | 'parsing' | 'mapping' | 'uploading';

export interface ContactImportProgress {
  phase: ContactImportProgressPhase;
  /** 0–100 */
  percent: number;
  detail?: string;
}

export const CONTACT_IMPORT_PREVIEW_MAX_ROWS = 20;

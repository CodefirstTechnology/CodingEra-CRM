/** One parsed data row from an uploaded import workbook. */
export interface LeadImportParsedRow {
  /** 1-based Excel row number (header is row 1). */
  rowNumber: number;
  /** Column header → cell text. */
  values: Record<string, string>;
}

export interface LeadImportSummary {
  totalRows: number;
  parsedRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
}

export interface LeadImportParseResult {
  columns: string[];
  rows: LeadImportParsedRow[];
  summary: LeadImportSummary;
}

export const LEAD_IMPORT_PREVIEW_MAX_ROWS = 20;

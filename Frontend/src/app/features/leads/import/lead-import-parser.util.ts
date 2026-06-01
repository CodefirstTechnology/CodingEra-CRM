import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { isLeadImportCsvFile, isLeadImportXlsxFile, LEAD_IMPORT_CHUNK_SIZE } from './lead-import.constants';
import type {
  LeadImportParseResult,
  LeadImportParsedRow,
  LeadImportProgress,
  LeadImportSummary,
} from './lead-import.models';
import { yieldToMain } from './lead-import-progress.util';

export interface LeadImportParseOptions {
  onProgress?: (progress: LeadImportProgress) => void;
}

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function rowHasContent(cells: string[]): boolean {
  return cells.some((c) => c.length > 0);
}

function resolveColumns(headerRow: unknown[]): string[] {
  const used = new Map<string, number>();
  return headerRow.map((cell, index) => {
    const label = cellText(cell);
    const base = label || `Column ${index + 1}`;
    const count = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function pickValue(values: Record<string, string>, columns: string[], aliases: string[]): string {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  for (const col of columns) {
    if (aliasSet.has(normalizeHeader(col))) {
      return values[col]?.trim() ?? '';
    }
  }
  return '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Client-side estimate until server validation on import. */
function isValidImportRow(values: Record<string, string>, columns: string[]): boolean {
  const firstName = pickValue(values, columns, ['first name', 'firstname', 'first_name']);
  const lastName = pickValue(values, columns, ['last name', 'lastname', 'last_name']);
  const email = pickValue(values, columns, ['email', 'e-mail']);
  return firstName.length > 0 && lastName.length > 0 && isValidEmail(email);
}

function emailForRow(values: Record<string, string>, columns: string[]): string {
  return pickValue(values, columns, ['email', 'e-mail']).toLowerCase();
}

async function buildSummaryAsync(
  rows: LeadImportParsedRow[],
  columns: string[],
  totalRows: number,
  onProgress?: (progress: LeadImportProgress) => void,
): Promise<LeadImportSummary> {
  const parsedRows = rows.length;
  const seenEmails = new Set<string>();
  let validRows = 0;
  let duplicateRows = 0;
  let invalidRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = emailForRow(row.values, columns);
    const isDuplicate = email.length > 0 && seenEmails.has(email);
    if (email.length > 0) seenEmails.add(email);

    if (isDuplicate) duplicateRows++;
    if (isValidImportRow(row.values, columns)) {
      validRows++;
    } else {
      invalidRows++;
    }

    if (i > 0 && i % LEAD_IMPORT_CHUNK_SIZE === 0) {
      onProgress?.({
        phase: 'parsing',
        percent: 90 + Math.round((i / Math.max(rows.length, 1)) * 9),
        detail: `Summarizing row ${i.toLocaleString()} of ${rows.length.toLocaleString()}…`,
      });
      await yieldToMain();
    }
  }

  return { totalRows, parsedRows, validRows, duplicateRows, invalidRows };
}

/** Shared row/column parsing for Excel and CSV matrix input (chunked for large files). */
async function parseLeadImportMatrixAsync(
  matrix: unknown[][],
  options?: LeadImportParseOptions,
): Promise<LeadImportParseResult> {
  if (matrix.length === 0) {
    throw new Error('The file is empty.');
  }

  const onProgress = options?.onProgress;
  const columns = resolveColumns(matrix[0] ?? []);
  const dataMatrix = matrix.slice(1);
  const totalRows = dataMatrix.length;

  onProgress?.({
    phase: 'parsing',
    percent: 5,
    detail: `Parsing ${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'}…`,
  });

  const rows: LeadImportParsedRow[] = [];
  for (let i = 0; i < dataMatrix.length; i++) {
    const rawRow = dataMatrix[i] ?? [];
    const cells = columns.map((_, colIndex) => cellText(rawRow[colIndex]));
    if (!rowHasContent(cells)) continue;

    const values: Record<string, string> = {};
    for (let c = 0; c < columns.length; c++) {
      values[columns[c]] = cells[c] ?? '';
    }

    rows.push({
      rowNumber: i + 2,
      values,
    });

    if (i > 0 && i % LEAD_IMPORT_CHUNK_SIZE === 0) {
      onProgress?.({
        phase: 'parsing',
        percent: 5 + Math.round((i / Math.max(dataMatrix.length, 1)) * 84),
        detail: `Parsing row ${i.toLocaleString()} of ${totalRows.toLocaleString()}…`,
      });
      await yieldToMain();
    }
  }

  const summary = await buildSummaryAsync(rows, columns, totalRows, onProgress);
  onProgress?.({ phase: 'parsing', percent: 100, detail: 'Parse complete' });

  return { columns, rows, summary };
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reads the first worksheet of an `.xlsx` file and returns rows + summary stats. */
export async function parseLeadImportXlsx(
  file: File,
  options?: LeadImportParseOptions,
): Promise<LeadImportParseResult> {
  options?.onProgress?.({ phase: 'reading', percent: 0, detail: 'Reading Excel file…' });
  const buffer = await file.arrayBuffer();
  options?.onProgress?.({ phase: 'reading', percent: 100, detail: 'Reading Excel file…' });

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The workbook has no worksheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  return parseLeadImportMatrixAsync(matrix, options);
}

function parseCsvMatrixFromText(text: string, options?: LeadImportParseOptions): Promise<LeadImportParseResult> {
  const normalized = stripUtf8Bom(text);
  const parsed = Papa.parse<unknown[]>(normalized, {
    header: false,
    skipEmptyLines: false,
    transform: (value: string) => cellText(value),
  });

  const fatal = parsed.errors.find(
    (err) => err.type === 'Quotes' || err.type === 'FieldMismatch',
  );
  if (fatal) {
    throw new Error(fatal.message || 'Could not parse the CSV file.');
  }

  return parseLeadImportMatrixAsync(parsed.data, options);
}

/** Reads a UTF-8 `.csv` file and returns rows + summary stats. */
export async function parseLeadImportCsv(
  file: File,
  options?: LeadImportParseOptions,
): Promise<LeadImportParseResult> {
  options?.onProgress?.({ phase: 'reading', percent: 0, detail: 'Reading CSV file…' });
  const text = await file.text();
  options?.onProgress?.({ phase: 'reading', percent: 100, detail: 'Reading CSV file…' });
  return parseCsvMatrixFromText(text, options);
}

/** Parses `.xlsx` or `.csv` uploads through the shared preview pipeline. */
export async function parseLeadImportFile(
  file: File,
  options?: LeadImportParseOptions,
): Promise<LeadImportParseResult> {
  if (isLeadImportXlsxFile(file)) {
    return parseLeadImportXlsx(file, options);
  }
  if (isLeadImportCsvFile(file)) {
    return parseLeadImportCsv(file, options);
  }
  throw new Error('Unsupported file type.');
}

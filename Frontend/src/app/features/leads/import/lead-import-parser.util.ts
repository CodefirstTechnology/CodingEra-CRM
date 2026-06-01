import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { isLeadImportCsvFile, isLeadImportXlsxFile } from './lead-import.constants';
import type { LeadImportParseResult, LeadImportParsedRow, LeadImportSummary } from './lead-import.models';

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

/** Temporary client-side validation until backend import rules exist. */
function isValidImportRow(values: Record<string, string>, columns: string[]): boolean {
  const firstName = pickValue(values, columns, ['first name', 'firstname', 'first_name']);
  const lastName = pickValue(values, columns, ['last name', 'lastname', 'last_name']);
  const email = pickValue(values, columns, ['email', 'e-mail']);
  return firstName.length > 0 && lastName.length > 0 && isValidEmail(email);
}

function emailForRow(values: Record<string, string>, columns: string[]): string {
  return pickValue(values, columns, ['email', 'e-mail']).toLowerCase();
}

function buildSummary(rows: LeadImportParsedRow[], columns: string[], totalRows: number): LeadImportSummary {
  const parsedRows = rows.length;
  const seenEmails = new Set<string>();
  let validRows = 0;
  let duplicateRows = 0;
  let invalidRows = 0;

  for (const row of rows) {
    const email = emailForRow(row.values, columns);
    const isDuplicate = email.length > 0 && seenEmails.has(email);
    if (email.length > 0) seenEmails.add(email);

    if (isDuplicate) duplicateRows++;
    if (isValidImportRow(row.values, columns)) {
      validRows++;
    } else {
      invalidRows++;
    }
  }

  return { totalRows, parsedRows, validRows, duplicateRows, invalidRows };
}

/** Shared row/column parsing for Excel and CSV matrix input. */
function parseLeadImportMatrix(matrix: unknown[][]): LeadImportParseResult {
  if (matrix.length === 0) {
    throw new Error('The file is empty.');
  }

  const columns = resolveColumns(matrix[0] ?? []);
  const dataMatrix = matrix.slice(1);
  const totalRows = dataMatrix.length;

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
  }

  return {
    columns,
    rows,
    summary: buildSummary(rows, columns, totalRows),
  };
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reads the first worksheet of an `.xlsx` file and returns rows + temporary summary stats. */
export async function parseLeadImportXlsx(file: File): Promise<LeadImportParseResult> {
  const buffer = await file.arrayBuffer();
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

  return parseLeadImportMatrix(matrix);
}

function parseCsvText(text: string): LeadImportParseResult {
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

  return parseLeadImportMatrix(parsed.data);
}

/** Reads a UTF-8 `.csv` file and returns rows + temporary summary stats. */
export async function parseLeadImportCsv(file: File): Promise<LeadImportParseResult> {
  const text = await file.text();
  return parseCsvText(text);
}

/** Parses `.xlsx` or `.csv` uploads through the shared preview pipeline. */
export async function parseLeadImportFile(file: File): Promise<LeadImportParseResult> {
  if (isLeadImportXlsxFile(file)) {
    return parseLeadImportXlsx(file);
  }
  if (isLeadImportCsvFile(file)) {
    return parseLeadImportCsv(file);
  }
  throw new Error('Unsupported file type.');
}

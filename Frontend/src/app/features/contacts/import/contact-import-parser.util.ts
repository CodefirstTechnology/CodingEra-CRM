import {
  isContactImportCsvFile,
  isContactImportXlsxFile,
  CONTACT_IMPORT_CHUNK_SIZE,
} from './contact-import.constants';
import { loadLeadImportPapa } from '../../leads/import/lead-import-papaparse.lib'; // Reuse
import { loadLeadImportXlsx } from '../../leads/import/lead-import-xlsx.lib'; // Reuse
import {
  estimateImportRowValid,
  isTemplateHintRow,
} from './contact-import-validation.util';
import type {
  ContactImportParseResult,
  ContactImportParsedRow,
  ContactImportProgress,
  ContactImportSummary,
} from './contact-import.models';
import { yieldToMain } from '../../leads/import/lead-import-progress.util'; // Reuse

export interface ContactImportParseOptions {
  onProgress?: (progress: ContactImportProgress) => void;
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

function isValidImportRow(values: Record<string, string>, columns: string[]): boolean {
  return estimateImportRowValid(values, columns, pickValue);
}

function emailForRow(values: Record<string, string>, columns: string[]): string {
  return pickValue(values, columns, ['email', 'e-mail']).toLowerCase();
}

function mobileForRow(values: Record<string, string>, columns: string[]): string {
  return pickValue(values, columns, ['mobile', 'phone', 'mobile number']);
}

async function buildSummaryAsync(
  rows: ContactImportParsedRow[],
  columns: string[],
  totalRows: number,
  onProgress?: (progress: ContactImportProgress) => void,
): Promise<ContactImportSummary> {
  const parsedRows = rows.length;
  const seenEmails = new Set<string>();
  const seenMobiles = new Set<string>();
  let validRows = 0;
  let duplicateRows = 0;
  let invalidRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = emailForRow(row.values, columns);
    const mobile = mobileForRow(row.values, columns);
    const isDuplicate =
      (email.length > 0 && seenEmails.has(email)) ||
      (mobile.length > 0 && seenMobiles.has(mobile));
    if (email.length > 0) seenEmails.add(email);
    if (mobile.length > 0) seenMobiles.add(mobile);

    if (isDuplicate) duplicateRows++;
    if (isValidImportRow(row.values, columns)) {
      validRows++;
    } else {
      invalidRows++;
    }

    if (i > 0 && i % CONTACT_IMPORT_CHUNK_SIZE === 0) {
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
async function parseContactImportMatrixAsync(
  matrix: unknown[][],
  options?: ContactImportParseOptions,
): Promise<ContactImportParseResult> {
  if (matrix.length === 0) {
    throw new Error('The file is empty.');
  }

  const onProgress = options?.onProgress;
  const columns = resolveColumns(matrix[0] ?? []);
  const dataMatrix = matrix.slice(1);
  const totalRows = dataMatrix.filter((rawRow) => {
    const cells = columns.map((_, colIndex) => cellText((rawRow ?? [])[colIndex]));
    return rowHasContent(cells) && !isTemplateHintRow(cells);
  }).length;

  onProgress?.({
    phase: 'parsing',
    percent: 5,
    detail: `Parsing ${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'}…`,
  });

  const rows: ContactImportParsedRow[] = [];
  for (let i = 0; i < dataMatrix.length; i++) {
    const rawRow = dataMatrix[i] ?? [];
    const cells = columns.map((_, colIndex) => cellText(rawRow[colIndex]));
    if (!rowHasContent(cells) || isTemplateHintRow(cells)) continue;

    const values: Record<string, string> = {};
    for (let c = 0; c < columns.length; c++) {
      values[columns[c]] = cells[c] ?? '';
    }

    rows.push({
      rowNumber: i + 2,
      values,
    });

    if (i > 0 && i % CONTACT_IMPORT_CHUNK_SIZE === 0) {
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
export async function parseContactImportXlsx(
  file: File,
  options?: ContactImportParseOptions,
): Promise<ContactImportParseResult> {
  options?.onProgress?.({ phase: 'reading', percent: 0, detail: 'Reading Excel file…' });
  const buffer = await file.arrayBuffer();
  options?.onProgress?.({ phase: 'reading', percent: 100, detail: 'Reading Excel file…' });

  const XLSX = await loadLeadImportXlsx();
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

  return parseContactImportMatrixAsync(matrix, options);
}

async function parseCsvMatrixFromText(
  text: string,
  options?: ContactImportParseOptions,
): Promise<ContactImportParseResult> {
  const normalized = stripUtf8Bom(text);
  const Papa = await loadLeadImportPapa();
  const parsed = Papa.parse<unknown[]>(normalized, {
    header: false,
    skipEmptyLines: 'greedy',
    transform: (value: string) => cellText(value),
  });

  const fatal = parsed.errors.find(
    (err) => err.type === 'Quotes' || err.type === 'FieldMismatch',
  );
  if (fatal) {
    throw new Error(fatal.message || 'Could not parse the CSV file.');
  }

  return parseContactImportMatrixAsync(parsed.data, options);
}

/** Reads a UTF-8 `.csv` file and returns rows + summary stats. */
export async function parseContactImportCsv(
  file: File,
  options?: ContactImportParseOptions,
): Promise<ContactImportParseResult> {
  options?.onProgress?.({ phase: 'reading', percent: 0, detail: 'Reading CSV file…' });
  const text = await file.text();
  options?.onProgress?.({ phase: 'reading', percent: 100, detail: 'Reading CSV file…' });
  return parseCsvMatrixFromText(text, options);
}

/** Parses `.xlsx` or `.csv` uploads through the shared preview pipeline. */
export async function parseContactImportFile(
  file: File,
  options?: ContactImportParseOptions,
): Promise<ContactImportParseResult> {
  if (isContactImportXlsxFile(file)) {
    return parseContactImportXlsx(file, options);
  }
  if (isContactImportCsvFile(file)) {
    return parseContactImportCsv(file, options);
  }
  throw new Error('Unsupported file type.');
}

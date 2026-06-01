import type { LeadImportParsedRow, LeadImportProgress } from './lead-import.models';
import type { LeadImportRowDto } from './lead-import-api.models';
import { LEAD_IMPORT_CHUNK_SIZE } from './lead-import.constants';
import { yieldToMain } from './lead-import-progress.util';

function normalizeHeader(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
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

function optionalField(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

function mapParsedRowToImportDto(row: LeadImportParsedRow, columns: string[]): LeadImportRowDto {
  const v = row.values;
  return {
    rowNumber: row.rowNumber,
    salutation: optionalField(pickValue(v, columns, ['salutation'])),
    firstName: optionalField(pickValue(v, columns, ['first name', 'firstname', 'first_name'])),
    lastName: optionalField(pickValue(v, columns, ['last name', 'lastname', 'last_name'])),
    mobile: optionalField(pickValue(v, columns, ['mobile', 'phone', 'mobile number'])),
    email: optionalField(pickValue(v, columns, ['email', 'e-mail'])),
    organization: optionalField(pickValue(v, columns, ['organization', 'organisation', 'company'])),
    industry: optionalField(pickValue(v, columns, ['industry'])),
    noOfEmployees: optionalField(
      pickValue(v, columns, ['no of employees', 'employees', 'employee count', 'no_of_employees']),
    ),
    annualRevenue: optionalField(
      pickValue(v, columns, ['annual revenue', 'revenue', 'annual_revenue']),
    ),
    website: optionalField(pickValue(v, columns, ['website', 'web site', 'url'])),
    territory: optionalField(pickValue(v, columns, ['territory'])),
    status: optionalField(pickValue(v, columns, ['status', 'lead status'])),
    leadOwner: optionalField(pickValue(v, columns, ['lead owner', 'owner', 'assigned to'])),
    requestType: optionalField(pickValue(v, columns, ['request type', 'request_type'])),
    requirement: optionalField(pickValue(v, columns, ['requirement', 'requirements'])),
    additionalDetails: optionalField(
      pickValue(v, columns, ['additional details', 'notes', 'additional_details']),
    ),
  };
}

/** Maps parsed spreadsheet rows to the backend import DTO shape. */
export function mapParsedRowsToImportDtos(
  rows: readonly LeadImportParsedRow[],
  columns: string[],
): LeadImportRowDto[] {
  return rows.map((row) => mapParsedRowToImportDto(row, columns));
}

/** Chunked mapper for large uploads — yields to keep the UI responsive. */
export async function mapParsedRowsToImportDtosAsync(
  rows: readonly LeadImportParsedRow[],
  columns: string[],
  onProgress?: (progress: LeadImportProgress) => void,
): Promise<LeadImportRowDto[]> {
  const dtos: LeadImportRowDto[] = [];
  const total = rows.length;

  for (let i = 0; i < total; i++) {
    dtos.push(mapParsedRowToImportDto(rows[i], columns));

    if (i > 0 && i % LEAD_IMPORT_CHUNK_SIZE === 0) {
      onProgress?.({
        phase: 'mapping',
        percent: Math.round((i / Math.max(total, 1)) * 100),
        detail: `Preparing row ${i.toLocaleString()} of ${total.toLocaleString()}…`,
      });
      await yieldToMain();
    }
  }

  onProgress?.({ phase: 'mapping', percent: 100, detail: 'Ready to upload' });
  return dtos;
}

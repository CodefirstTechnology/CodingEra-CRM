import { TextFormatter } from '../../../shared/utils/text-normalizer';
import { resolveImportNameParts } from './lead-import-name.util';
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
  const { firstName, lastName } = resolveImportNameParts(v, columns, pickValue);

  const dto: LeadImportRowDto = {
    rowNumber: row.rowNumber,
    salutation: optionalField(TextFormatter.personName(pickValue(v, columns, ['salutation']))),
    firstName: optionalField(TextFormatter.personName(firstName)),
    lastName: optionalField(TextFormatter.personName(lastName)),
    mobile: optionalField(TextFormatter.mobile(pickValue(v, columns, ['mobile', 'phone', 'mobile number']))),
    email: optionalField(TextFormatter.email(pickValue(v, columns, ['email', 'e-mail']))),
    gender: optionalField(TextFormatter.gender(pickValue(v, columns, ['gender']))),
    organization: optionalField(
      TextFormatter.companyName(pickValue(v, columns, ['organization', 'organisation', 'company'])),
    ),
    industry: optionalField(TextFormatter.industry(pickValue(v, columns, ['industry']))),
    noOfEmployees: optionalField(
      pickValue(v, columns, ['no of employees', 'employees', 'employee count', 'no_of_employees']),
    ),
    annualRevenue: optionalField(
      pickValue(v, columns, ['annual revenue', 'revenue', 'annual_revenue']),
    ),
    website: optionalField(
      TextFormatter.website(pickValue(v, columns, ['website', 'web site', 'url'])),
    ),
    gst: optionalField(
      TextFormatter.gstin(pickValue(v, columns, ['gstin', 'gst', 'gst number'])),
    ),
    territory: optionalField(TextFormatter.territory(pickValue(v, columns, ['territory']))),
    location: optionalField(
      TextFormatter.address(pickValue(v, columns, ['location', 'address'])),
    ),
    status: optionalField(
      TextFormatter.status(pickValue(v, columns, ['status', 'lead status'])),
    ),
    leadOwner: optionalField(
      TextFormatter.personName(pickValue(v, columns, ['lead owner', 'owner', 'assigned to'])),
    ),
    requestType: optionalField(pickValue(v, columns, ['request type', 'request_type'])),
    leadDate: optionalField(
      TextFormatter.date(pickValue(v, columns, ['lead date', 'lead_date', 'date'])).value,
    ),
    requirement: optionalField(
      TextFormatter.requirement(pickValue(v, columns, ['requirement', 'requirements'])),
    ),
    additionalDetails: optionalField(
      TextFormatter.description(
        pickValue(v, columns, ['additional details', 'notes', 'additional_details']),
      ),
    ),
  };

  return dto;
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

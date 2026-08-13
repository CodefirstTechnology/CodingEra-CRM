import { TextFormatter } from '../../../shared/utils/text-normalizer';
import { resolveImportNameParts } from '../../leads/import/lead-import-name.util';
import type { ContactImportParsedRow, ContactImportProgress } from './contact-import.models';
import type { ContactImportRowDto } from './contact-import-api.models';
import { CONTACT_IMPORT_CHUNK_SIZE } from './contact-import.constants';
import { yieldToMain } from '../../leads/import/lead-import-progress.util'; // Reuse progress utility

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

function mapParsedRowToImportDto(row: ContactImportParsedRow, columns: string[]): ContactImportRowDto {
  const v = row.values;
  const { firstName, lastName } = resolveImportNameParts(v, columns, pickValue);

  const dto: ContactImportRowDto = {
    rowNumber: row.rowNumber,
    salutation: optionalField(TextFormatter.personName(pickValue(v, columns, ['salutation']))),
    firstName: optionalField(TextFormatter.personName(firstName)),
    lastName: optionalField(TextFormatter.personName(lastName)),
    mobile: optionalField(TextFormatter.mobile(pickValue(v, columns, ['mobile', 'phone', 'mobile number']))),
    email: optionalField(TextFormatter.email(pickValue(v, columns, ['email', 'e-mail']))),
    gender: optionalField(TextFormatter.gender(pickValue(v, columns, ['gender']))),
    organization: optionalField(
      TextFormatter.companyName(pickValue(v, columns, ['company', 'company name', 'organization', 'organisation'])),
    ),
    designation: optionalField(
      pickValue(v, columns, ['designation', 'job title', 'title']),
    ),
    address: optionalField(
      TextFormatter.address(pickValue(v, columns, ['address', 'location'])),
    ),
  };

  return dto;
}

/** Maps parsed spreadsheet rows to the backend import DTO shape. */
export function mapParsedRowsToImportDtos(
  rows: readonly ContactImportParsedRow[],
  columns: string[],
): ContactImportRowDto[] {
  return rows.map((row) => mapParsedRowToImportDto(row, columns));
}

/** Chunked mapper for large uploads — yields to keep the UI responsive. */
export async function mapParsedRowsToImportDtosAsync(
  rows: readonly ContactImportParsedRow[],
  columns: string[],
  onProgress?: (progress: ContactImportProgress) => void,
): Promise<ContactImportRowDto[]> {
  const dtos: ContactImportRowDto[] = [];
  const total = rows.length;

  for (let i = 0; i < total; i++) {
    dtos.push(mapParsedRowToImportDto(rows[i], columns));

    if (i > 0 && i % CONTACT_IMPORT_CHUNK_SIZE === 0) {
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

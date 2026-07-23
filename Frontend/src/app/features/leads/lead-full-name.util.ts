import { TextFormatter } from '../../shared/utils/text-normalizer';

/** Display name from API row parts (first/last or stored `name`), person-normalized. */
export function fullNameFromLeadParts(row: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): string {
  const fromParts = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(' ');
  const raw = fromParts || row.name?.trim() || '';
  return TextFormatter.entityName('lead', raw);
}

/**
 * Splits a single full-name string for API `firstName` / `lastName` fields.
 * Normalizes via {@link TextFormatter.personName} before splitting.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = TextFormatter.personName(fullName);
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

export function buildLeadDisplayName(salutation: string, first: string, last: string): string {
  const parts = [
    TextFormatter.personName(salutation),
    TextFormatter.personName(first),
    TextFormatter.personName(last),
  ].filter(Boolean);
  return parts.join(' ').trim() || TextFormatter.personName(first) || TextFormatter.personName(last) || 'Lead';
}

/** Normalize a full-name form control in place (e.g. on blur). */
export function normalizeFullNameControl(control: {
  value: unknown;
  setValue: (v: string, opts?: { emitEvent?: boolean }) => void;
}): void {
  const raw = String(control.value ?? '');
  const next = TextFormatter.personName(raw);
  if (next !== raw) {
    control.setValue(next, { emitEvent: false });
  }
}

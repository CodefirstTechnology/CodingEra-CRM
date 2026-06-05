/** Display name from API row parts (first/last or stored `name`). */
export function fullNameFromLeadParts(row: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): string {
  const fromParts = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(' ');
  return fromParts || row.name?.trim() || '';
}

/** Splits a single full-name string for API `firstName` / `lastName` fields. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildLeadDisplayName(salutation: string, first: string, last: string): string {
  const parts = [salutation.trim(), first.trim(), last.trim()].filter(Boolean);
  return parts.join(' ').trim() || first.trim() || last.trim() || 'Lead';
}

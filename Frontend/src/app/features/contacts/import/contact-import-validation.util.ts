import { resolveImportNameParts } from '../../leads/import/lead-import-name.util';

/** Required columns for every imported contact (display + client-side estimates). */
export const CONTACT_IMPORT_REQUIRED_FIELD_LABELS = [
  'First Name',
  'Last Name',
  'Mobile',
] as const;

const VALID_IMPORT_GENDERS = new Set(
  ['male', 'female', 'other', 'prefer not to say'].map((g) => g.toLowerCase()),
);

export function isValidImportEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** True when mobile looks usable (between 8 and 15 digits). */
export function isValidImportMobile(mobile: string): boolean {
  const trimmed = mobile.trim();
  if (!trimmed) return false; // Mobile is required
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function isValidImportGender(gender: string): boolean {
  const trimmed = gender.trim();
  if (!trimmed) return true; // Optional
  return VALID_IMPORT_GENDERS.has(trimmed.toLowerCase());
}

/** True when a spreadsheet row is the template Required/Optional hint row. */
export function isTemplateHintRow(cells: readonly string[]): boolean {
  const tokens = cells.map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((t) => t === 'required' || t === 'optional');
}

type PickValueFn = (
  values: Record<string, string>,
  columns: string[],
  aliases: string[],
) => string;

/** Client-side validity estimate (mirrors Contact required-field and length rules). */
export function estimateImportRowValid(
  values: Record<string, string>,
  columns: string[],
  pickValue: PickValueFn,
): boolean {
  const { firstName, lastName } = resolveImportNameParts(values, columns, pickValue);
  const mobile = pickValue(values, columns, ['mobile', 'phone', 'mobile number']);
  const email = pickValue(values, columns, ['email', 'e-mail']);
  const gender = pickValue(values, columns, ['gender']);
  const salutation = pickValue(values, columns, ['salutation']);
  const companyName = pickValue(values, columns, ['company', 'company name', 'organization', 'organisation']);
  const designation = pickValue(values, columns, ['designation', 'job title', 'title']);

  // Required checks
  if (firstName.length === 0 || firstName.length > 80) return false;
  if (lastName.length === 0 || lastName.length > 120) return false;
  if (mobile.length === 0 || !isValidImportMobile(mobile)) return false;

  // Optional checks
  if (email.length > 0 && (email.length > 160 || !isValidImportEmail(email))) return false;
  if (!isValidImportGender(gender)) return false;
  if (salutation.length > 32) return false;
  if (companyName.length > 200) return false;
  if (designation.length > 120) return false;

  return true;
}

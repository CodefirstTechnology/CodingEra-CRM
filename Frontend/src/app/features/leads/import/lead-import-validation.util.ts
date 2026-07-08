import { LEAD_DEAL_MATCH_MOBILE_MIN_DIGITS } from '../../../shared/utils/lead-conversion.util';
import { resolveImportNameParts } from './lead-import-name.util';

/** Required columns for every imported lead (display + client-side estimates). */
export const LEAD_IMPORT_REQUIRED_FIELD_LABELS = [
  'Full Name',
  'Organization',
  'Industry',
  'Status',
  'Lead Owner',
  'Requirement',
] as const;

const VALID_IMPORT_GENDERS = new Set(
  ['male', 'female', 'other', 'prefer not to say'].map((g) => g.toLowerCase()),
);

export function isValidImportEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** True when a non-empty mobile looks usable (E.164 or national digits). */
export function isValidImportMobile(mobile: string): boolean {
  const trimmed = mobile.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= LEAD_DEAL_MATCH_MOBILE_MIN_DIGITS && digits.length <= 15;
}

export function isValidImportGender(gender: string): boolean {
  const trimmed = gender.trim();
  if (!trimmed) return true;
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

/** Client-side validity estimate (mirrors server required-field rules). */
export function estimateImportRowValid(
  values: Record<string, string>,
  columns: string[],
  pickValue: PickValueFn,
): boolean {
  const { firstName } = resolveImportNameParts(values, columns, pickValue);
  const organization = pickValue(values, columns, ['organization', 'organisation', 'company']);
  const industry = pickValue(values, columns, ['industry']);
  const status = pickValue(values, columns, ['status', 'lead status']);
  const leadOwner = pickValue(values, columns, ['lead owner', 'owner', 'assigned to']);
  const requirement = pickValue(values, columns, ['requirement', 'requirements']);
  const mobile = pickValue(values, columns, ['mobile', 'phone', 'mobile number']);
  const email = pickValue(values, columns, ['email', 'e-mail']);
  const gender = pickValue(values, columns, ['gender']);

  return (
    firstName.length > 0 &&
    organization.length > 0 &&
    industry.length > 0 &&
    status.length > 0 &&
    leadOwner.length > 0 &&
    requirement.length > 0 &&
    isValidImportMobile(mobile) &&
    (email.length === 0 || isValidImportEmail(email)) &&
    isValidImportGender(gender)
  );
}

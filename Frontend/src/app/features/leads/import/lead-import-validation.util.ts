/** Required columns for every imported lead (display + client-side estimates). */
export const LEAD_IMPORT_REQUIRED_FIELD_LABELS = [
  'First Name',
  'Last Name',
  'Mobile',
  'Email',
  'Requirement',
] as const;

export function isValidImportEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidImportMobile(mobile: string): boolean {
  return /^\d{10}$/.test(mobile.trim());
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
  const firstName = pickValue(values, columns, ['first name', 'firstname', 'first_name']);
  const lastName = pickValue(values, columns, ['last name', 'lastname', 'last_name']);
  const mobile = pickValue(values, columns, ['mobile', 'phone', 'mobile number']);
  const email = pickValue(values, columns, ['email', 'e-mail']);
  const requirement = pickValue(values, columns, ['requirement', 'requirements']);

  return (
    firstName.length > 0 &&
    lastName.length > 0 &&
    requirement.length > 0 &&
    isValidImportMobile(mobile) &&
    isValidImportEmail(email)
  );
}

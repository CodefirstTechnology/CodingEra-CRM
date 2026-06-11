import { splitFullName } from '../lead-full-name.util';

type PickValueFn = (
  values: Record<string, string>,
  columns: string[],
  aliases: string[],
) => string;

/** Resolves name parts from Full Name or legacy First/Last Name columns. */
export function resolveImportNameParts(
  values: Record<string, string>,
  columns: string[],
  pickValue: PickValueFn,
): { firstName: string; lastName: string } {
  const fullName = pickValue(values, columns, ['full name', 'fullname', 'full_name', 'name']);
  if (fullName.length > 0) {
    return splitFullName(fullName);
  }

  return {
    firstName: pickValue(values, columns, ['first name', 'firstname', 'first_name']),
    lastName: pickValue(values, columns, ['last name', 'lastname', 'last_name']),
  };
}

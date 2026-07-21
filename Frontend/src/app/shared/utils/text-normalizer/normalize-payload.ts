import { formatByKind, type FormatResult } from './text-formatters';
import { resolveFieldKind, type FieldKind } from './text-field-types';
import { isProtectedKey } from './text-sanitize';

export type FieldSchema = Record<string, FieldKind>;

export interface NormalizePayloadOptions {
  /** Explicit key → kind map (wins over auto-resolve). */
  schema?: FieldSchema;
  /** Only normalize keys present in schema / auto map; leave others untouched. */
  onlyKnownFields?: boolean;
  /** Skip keys in this set (case-insensitive). */
  skipKeys?: Iterable<string>;
}

/**
 * Walk a plain object and normalize string (and percentage) fields by name.
 * IDs, booleans, nested objects (except shallow string values), and protected keys are untouched.
 */
export function normalizePayload<T extends Record<string, unknown>>(
  payload: T,
  options?: NormalizePayloadOptions,
): T {
  const skip = new Set(
    [...(options?.skipKeys ?? [])].map((k) => k.toLowerCase()),
  );
  const out: Record<string, unknown> = { ...payload };

  for (const key of Object.keys(out)) {
    if (isProtectedKey(key) || skip.has(key.toLowerCase())) continue;

    const kind = options?.schema?.[key] ?? resolveFieldKind(key);
    if (!kind) {
      if (options?.onlyKnownFields) continue;
      continue;
    }

    const current = out[key];
    if (current == null) continue;
    if (typeof current === 'number' && kind !== 'percentage') continue;
    if (typeof current === 'boolean') continue;
    if (typeof current === 'object') continue;

    const result = formatByKind(kind, current);
    out[key] = result.value == null ? current : result.value;
  }

  return out as T;
}

/**
 * Normalize a single value when the field kind is known.
 */
export function normalizeValue(
  kind: FieldKind,
  value: unknown,
): FormatResult<string | number | null> {
  return formatByKind(kind, value);
}

/**
 * Apply {@link normalizePayload} then return only string fields as strings
 * (percentages stay numbers when the schema says so).
 */
export function normalizeRecordStrings(
  record: Record<string, string | undefined | null>,
  schema: FieldSchema,
): Record<string, string> {
  const asUnknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    asUnknown[k] = v ?? '';
  }
  const normalized = normalizePayload(asUnknown, { schema, onlyKnownFields: true });
  const out: Record<string, string> = {};
  for (const key of Object.keys(schema)) {
    const v = normalized[key];
    if (v == null) out[key] = '';
    else out[key] = String(v);
  }
  return out;
}

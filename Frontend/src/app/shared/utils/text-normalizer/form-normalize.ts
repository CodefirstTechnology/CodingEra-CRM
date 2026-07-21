import { AbstractControl, FormGroup } from '@angular/forms';
import { formatByKind } from './text-formatters';
import { resolveFieldKind, type FieldKind } from './text-field-types';
import { isProtectedKey } from './text-sanitize';
import { normalizePayload, type FieldSchema } from './normalize-payload';

export interface NormalizeFormOptions {
  schema?: FieldSchema;
  /** When true, mark controls dirty if value changed. Default false. */
  markDirty?: boolean;
  emitEvent?: boolean;
}

/**
 * Normalize Reactive Form control values in-place before validation / submit.
 * Call immediately before `form.valid` checks or API mapping.
 */
export function normalizeFormGroup(form: FormGroup, options?: NormalizeFormOptions): void {
  const emitEvent = options?.emitEvent ?? false;
  for (const key of Object.keys(form.controls)) {
    if (isProtectedKey(key)) continue;
    const control = form.controls[key];
    if (!control) continue;
    normalizeControl(control, key, options?.schema?.[key] ?? resolveFieldKind(key), {
      markDirty: options?.markDirty,
      emitEvent,
    });
  }
}

export function normalizeControl(
  control: AbstractControl,
  key: string,
  kind: FieldKind | null,
  options?: { markDirty?: boolean; emitEvent?: boolean },
): void {
  if (!kind || isProtectedKey(key)) return;
  const raw = control.value;
  if (raw == null || typeof raw === 'object') return;
  if (typeof raw === 'number' && kind !== 'percentage') return;

  const result = formatByKind(kind, raw);
  const next = result.value;
  if (next === raw || (next == null && (raw === '' || raw == null))) return;

  const valueToSet = next == null ? '' : next;
  if (control.value === valueToSet) return;
  control.setValue(valueToSet, { emitEvent: options?.emitEvent ?? false });
  if (options?.markDirty) control.markAsDirty();
}

/**
 * Snapshot normalize: returns a plain object from `getRawValue()` with fields formatted.
 * Does not mutate the form — use when you only need the payload.
 */
export function normalizeFormValue<T extends Record<string, unknown>>(
  raw: T,
  schema?: FieldSchema,
): T {
  return normalizePayload(raw, {
    schema,
    onlyKnownFields: true,
  });
}

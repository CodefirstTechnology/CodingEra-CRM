import { AbstractControl } from '@angular/forms';

/** Indian GSTIN format (15 characters). */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;

export const GSTIN_ERROR_MESSAGE = 'Please enter a valid GSTIN.';

export const GSTIN_MAX_LENGTH = 15;

/** Validation error key on form controls ({@link optionalGstinValidator}). */
export const GSTIN_ERROR_KEY = 'gstin';

/** Trim surrounding whitespace, strip internal spaces, uppercase. */
export function normalizeGstin(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function isValidGstin(value: string | null | undefined): boolean {
  const normalized = normalizeGstin(value);
  if (!normalized) return true;
  return GSTIN_PATTERN.test(normalized);
}

export function gstControlInvalid(control: AbstractControl): boolean {
  return control.invalid && (control.dirty || control.touched);
}

/** Uppercase + trim on input; updates the bound control. */
export function syncGstinInputFromEvent(ev: Event, control: AbstractControl): void {
  const el = ev.target as HTMLInputElement;
  const normalized = normalizeGstin(el.value);
  if (el.value !== normalized) {
    el.value = normalized;
  }
  control.setValue(normalized, { emitEvent: true });
}

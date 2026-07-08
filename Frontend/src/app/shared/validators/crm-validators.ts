import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import {
  GSTIN_ERROR_KEY,
  GSTIN_MAX_LENGTH,
  GSTIN_PATTERN,
  normalizeGstin,
} from '../utils/gstin.util';

/** Empty is valid; non-empty must parse as a URL (https:// is prepended when missing). */
export function optionalUrlValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) return null;
    try {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      new URL(withProto);
      return null;
    } catch {
      return { url: true };
    }
  };
}

/** Empty is valid; non-empty must be a valid email address. */
export function optionalEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = String(control.value ?? '').trim();
    if (!v) return null;
    return Validators.email(control);
  };
}

/** Empty is valid; non-empty must be exactly 10 digits (Indian mobile). */
export function optionalMobile10Validator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = String(control.value ?? '').trim();
    if (!v) return null;
    return /^\d{10}$/.test(v) ? null : { pattern: true };
  };
}

/** Empty is valid; non-empty must look like a phone number (length and allowed characters). */
export function optionalPhoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = String(control.value ?? '').trim();
    if (!v) return null;
    const ok = /^[+]?[\d\s().-]{7,40}$/.test(v);
    return ok ? null : { phone: true };
  };
}

/** Empty is valid; non-empty must match {@link GSTIN_PATTERN}. */
export function optionalGstinValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const normalized = normalizeGstin(control.value);
    if (!normalized) return null;
    return GSTIN_PATTERN.test(normalized) ? null : { [GSTIN_ERROR_KEY]: true };
  };
}

/** Standard validators for optional GSTIN form controls. */
export function gstFormValidators(): ValidatorFn[] {
  return [Validators.maxLength(GSTIN_MAX_LENGTH), optionalGstinValidator()];
}

function localTodayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local calendar date as `YYYY-MM-DD` (e.g. date input min). */
export function todayIsoDateLocal(): string {
  return localTodayIsoDate();
}

/** ISO date (`YYYY-MM-DD`) must be today or later; optional exempt value for edit loads. */
export function notPastIsoDateValidator(allowedPast?: () => string | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) return null;
    const exempt = allowedPast?.()?.trim();
    if (exempt && raw === exempt) return null;
    return raw >= localTodayIsoDate() ? null : { pastDate: true };
  };
}

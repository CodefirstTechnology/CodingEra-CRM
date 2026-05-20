import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

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

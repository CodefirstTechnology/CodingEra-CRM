import type { ValidationErrors } from '@angular/forms';
import intlTelInput from 'intl-tel-input';

const INTL_TEL_ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Enter a valid mobile number.',
  'invalid-country-code': 'Select a valid country code.',
  'too-short': 'Mobile number is too short for the selected country.',
  'too-long': 'Mobile number is too long for the selected country.',
  'invalid-format': 'Enter a valid mobile number format.',
};

/** User-facing validation message for intl-tel-input form control errors. */
export function intlTelMobileErrorMessage(errors: ValidationErrors | null | undefined): string {
  if (!errors) return 'Enter a valid mobile number.';
  if (errors['required']) return 'Mobile is required.';

  const invalidPhone = errors['invalidPhone'] as
    | { errorCode?: number; errorMessage?: string }
    | undefined;
  if (invalidPhone?.errorMessage) {
    return INTL_TEL_ERROR_MESSAGES[invalidPhone.errorMessage] ?? 'Enter a valid mobile number.';
  }

  if (errors['pattern'] || errors['phone']) {
    return 'Enter a valid mobile number.';
  }

  return 'Enter a valid mobile number.';
}

/** Whether a control shows intl-tel validation errors (touched/dirty + invalid). */
export function intlTelFieldInvalid(
  control: { invalid: boolean; touched: boolean; dirty: boolean } | null | undefined,
): boolean {
  return !!control && control.invalid && (control.touched || control.dirty);
}

/** Trim and normalize stored mobile value (E.164 when valid). */
export function normalizeIntlTelStoredValue(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

let dialCodesLongestFirst: string[] | null = null;

function getDialCodesLongestFirst(): string[] {
  if (!dialCodesLongestFirst) {
    const codes = new Set<string>();
    intlTelInput.getCountryData().forEach((country) => codes.add(country.dialCode));
    dialCodesLongestFirst = [...codes].sort((a, b) => b.length - a.length);
  }
  return dialCodesLongestFirst;
}

/** Display E.164 as "+{code} {number}" (e.g. +91 4567898765). Non-international values pass through. */
export function formatIntlTelDisplay(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return raw || '—';
  if (/^null$/i.test(raw) || /^undefined$/i.test(raw)) return '—';
  if (!raw.startsWith('+')) return raw.replace(/\s+/g, ' ');

  const spaced = raw.match(/^(\+\d{1,4})\s+(.+)$/);
  if (spaced) {
    const national = spaced[2].replace(/\D/g, '');
    return national ? `${spaced[1]} ${national}` : spaced[1];
  }

  const digits = raw.slice(1).replace(/\D/g, '');
  if (!digits) return raw;

  for (const code of getDialCodesLongestFirst()) {
    if (digits.startsWith(code)) {
      const national = digits.slice(code.length);
      if (national) return `+${code} ${national}`;
      break;
    }
  }

  return `+${digits}`;
}

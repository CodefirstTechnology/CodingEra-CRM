import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Cross-field: confirm password must match the password field (default keys: password / confirmPassword). */
export function passwordsMatchValidator(
  passwordKey = 'password',
  confirmKey = 'confirmPassword',
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey);
    const confirm = group.get(confirmKey);
    if (!password || !confirm) return null;
    const cv = confirm.value as string;
    if (!cv) return null;
    const pv = password.value as string;
    return pv === cv ? null : { passwordMismatch: true };
  };
}

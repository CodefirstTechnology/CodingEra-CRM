import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Cross-field: confirm password must match password. */
export function passwordsMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password');
    const confirm = group.get('confirmPassword');
    if (!password || !confirm) return null;
    const cv = confirm.value as string;
    if (!cv) return null;
    const pv = password.value as string;
    return pv === cv ? null : { passwordMismatch: true };
  };
}

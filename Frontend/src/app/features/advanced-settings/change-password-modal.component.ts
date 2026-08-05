import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { ToastService } from '../../core/toast/toast.service';
import { passwordsMatchValidator } from '../auth/passwords-match.validator';

type PasswordField = 'current' | 'new' | 'confirm';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [ReactiveFormsModule, CrmModalComponent],
  templateUrl: './change-password-modal.component.html',
  styleUrl: './change-password-modal.component.scss',
})
export class ChangePasswordModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);

  readonly changed = output<void>();
  readonly dismiss = output<void>();

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly showCurrent = signal(false);
  protected readonly showNew = signal(false);
  protected readonly showConfirm = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
      newPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: [passwordsMatchValidator('newPassword', 'confirmPassword')] },
  );

  protected fieldInvalid(name: 'currentPassword' | 'newPassword' | 'confirmPassword'): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected confirmMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      (!!this.form.get('confirmPassword')?.dirty || !!this.form.get('confirmPassword')?.touched)
    );
  }

  protected toggleVisibility(field: PasswordField): void {
    if (field === 'current') this.showCurrent.update((v) => !v);
    else if (field === 'new') this.showNew.update((v) => !v);
    else this.showConfirm.update((v) => !v);
  }

  protected onDismiss(): void {
    if (this.submitting()) return;
    this.resetForm();
    this.dismiss.emit();
  }

  protected onConfirm(): void {
    this.formError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { currentPassword, newPassword } = this.form.getRawValue();
    if (currentPassword === newPassword) {
      const msg = 'New password must be different from the current password.';
      this.formError.set(msg);
      return;
    }

    this.submitting.set(true);
    this.auth.changePassword({ currentPassword, newPassword }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.ok) {
          this.toast.success('Password updated successfully.');
          this.resetForm();
          this.changed.emit();
          return;
        }
        const msg = res.error ?? 'Could not change password.';
        this.formError.set(msg);
        this.toast.error(msg);
      },
      error: () => {
        this.submitting.set(false);
        const msg = 'Something went wrong. Please try again.';
        this.formError.set(msg);
        this.toast.error(msg);
      },
    });
  }

  private resetForm(): void {
    this.form.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    this.formError.set(null);
    this.showCurrent.set(false);
    this.showNew.set(false);
    this.showConfirm.set(false);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}

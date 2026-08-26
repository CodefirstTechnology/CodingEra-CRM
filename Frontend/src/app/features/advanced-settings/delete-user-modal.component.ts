import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { AuthService } from '../../core/auth/auth.service';
import { AdminUsersService, type AdminUserRow } from '../../core/services/admin-users.service';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-delete-user-modal',
  standalone: true,
  imports: [ReactiveFormsModule, CrmModalComponent],
  templateUrl: './delete-user-modal.component.html',
  styleUrl: './delete-user-modal.component.scss',
})
export class DeleteUserModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly target = input<AdminUserRow | null>(null);

  readonly deleted = output<void>();
  readonly dismiss = output<void>();

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
  });

  protected passwordInvalid(): boolean {
    const c = this.form.get('password');
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected onDismiss(): void {
    if (this.submitting()) return;
    this.resetForm();
    this.dismiss.emit();
  }

  protected onConfirm(): void {
    const user = this.target();
    if (!user) return;

    this.formError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.form.disable();
    this.adminUsers
      .deleteUser(this.auth.token(), user.id, this.form.getRawValue().password)
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.form.enable();
          if (res.ok) {
            this.toast.success(`${user.name} was deleted.`);
            this.resetForm();
            this.deleted.emit();
            return;
          }
          const msg = res.error ?? 'Could not delete user.';
          this.formError.set(msg);
          this.toast.error(msg);
        },
        error: () => {
          this.submitting.set(false);
          this.form.enable();
          const msg = 'Something went wrong. Please try again.';
          this.formError.set(msg);
          this.toast.error(msg);
        },
      });
  }

  private resetForm(): void {
    this.form.reset({ password: '' });
    this.formError.set(null);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}

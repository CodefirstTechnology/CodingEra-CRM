import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { AdminUsersService } from '../../core/services/admin-users.service';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-admin-create-user-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './admin-create-user-modal.component.html',
  styleUrl: './admin-create-user-modal.component.scss',
})
export class AdminCreateUserModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly created = output<void>();
  readonly closed = output<void>();

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(128)]],
    phone: ['', Validators.maxLength(32)],
  });

  protected fieldInvalid(name: 'fullName' | 'email' | 'password' | 'phone'): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected submit(): void {
    this.formError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    const raw = this.form.getRawValue();
    this.adminUsers
      .createUser(this.auth.token(), {
        fullName: raw.fullName,
        email: raw.email,
        password: raw.password,
        phone: raw.phone.trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          if (!res.ok) {
            this.formError.set(res.error);
            return;
          }
          this.toast.success('Sales user created successfully.');
          this.form.reset({ fullName: '', email: '', password: '', phone: '' });
          this.form.markAsUntouched();
          this.created.emit();
          this.closed.emit();
        },
        error: () => {
          this.submitting.set(false);
          this.formError.set('Could not create user. Please try again.');
        },
      });
  }
}

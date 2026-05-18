import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { optionalPhoneValidator } from '../../shared/validators/crm-validators';
import { passwordsMatchValidator } from './passwords-match.validator';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
      confirmPassword: ['', Validators.required],
      phone: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
    },
    { validators: [passwordsMatchValidator()] },
  );

  protected submit(): void {
    this.formError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    const v = this.form.getRawValue();

    this.auth
      .register({
        fullName: v.fullName.trim(),
        email: v.email.trim(),
        password: v.password,
        phone: v.phone.trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          if (res.ok) {
            this.toast.show('Account created successfully');
            void this.router.navigateByUrl('/login', { replaceUrl: true });
          } else {
            const msg = res.error ?? 'Something went wrong.';
            this.formError.set(msg);
            this.toast.show(msg);
          }
        },
        error: () => {
          this.submitting.set(false);
          this.formError.set('Something went wrong. Please try again.');
        },
      });
  }

  protected fieldInvalid(name: 'fullName' | 'email' | 'password' | 'confirmPassword' | 'phone'): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected confirmMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      (!!this.form.get('confirmPassword')?.dirty || !!this.form.get('confirmPassword')?.touched)
    );
  }
}

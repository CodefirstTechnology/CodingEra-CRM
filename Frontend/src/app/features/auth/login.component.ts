import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyBrandingService } from '../../core/services/company-branding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly branding = inject(CompanyBrandingService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
  });

  ngOnInit(): void {
    this.branding.refresh();
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected submit(): void {
    this.formError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.loginWithCredentials(email, password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.ok) {
          this.branding.refresh();
          const target = res.redirectTo ?? '/user-dashboard';
          void this.router.navigateByUrl(target, { replaceUrl: true });
        } else {
          this.formError.set(res.error ?? 'Sign-in failed.');
        }
      },
      error: () => {
        this.submitting.set(false);
        this.formError.set('Sign-in failed.');
      },
    });
  }
}

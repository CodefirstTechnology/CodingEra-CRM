import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
  });

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
          void this.router.navigateByUrl('/', { replaceUrl: true });
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

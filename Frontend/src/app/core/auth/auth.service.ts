import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, Observable, of, timeout } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CreateFlowService } from '../create-flow/create-flow.service';
import { ProfilePanelService } from '../profile/profile-panel.service';
import { ToastService } from '../toast/toast.service';
import {
  AUTH_LEGACY_KEYS,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
} from './auth.constants';
import { maskEmail, writeLoginLog } from './login-log';
import type { RegisterPayload, UserSession } from './auth.models';

export interface LoginResult {
  ok: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly createFlow = inject(CreateFlowService);
  private readonly profilePanel = inject(ProfilePanelService);

  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<UserSession | null>(null);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  isAuthenticated(): boolean {
    return !!this._token();
  }

  hydrateFromStorage(): void {
    const token =
      localStorage.getItem(AUTH_TOKEN_KEY) ?? sessionStorage.getItem(AUTH_TOKEN_KEY);
    const raw =
      localStorage.getItem(AUTH_USER_KEY) ?? sessionStorage.getItem(AUTH_USER_KEY);
    if (!token || !raw) {
      this._token.set(null);
      this._user.set(null);
      return;
    }
    try {
      const user = JSON.parse(raw) as UserSession;
      if (!user?.email) throw new Error('invalid user');
      this._token.set(token);
      this._user.set(user);
      writeLoginLog('session_restored', {
        maskedEmail: maskEmail(user.email),
        userId: user.id,
        role: user.role,
      });
    } catch {
      writeLoginLog('session_invalid_cleared', { reason: 'corrupt_or_missing_user_payload' });
      this.clearStorageOnly();
      this._token.set(null);
      this._user.set(null);
    }
  }

  setSession(token: string, user: UserSession): void {
    this._token.set(token);
    this._user.set(user);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
  }

  loginWithCredentials(email: string, password: string): Observable<LoginResult> {
    const trimmed = email.trim();
    const base = environment.apiUrl?.replace(/\/$/, '');

    writeLoginLog('login_attempt', {
      mode: base ? 'api' : 'demo',
      maskedEmail: maskEmail(trimmed),
      ...(base ? { endpoint: `${base}/auth/login` } : {}),
    });

    if (!base) {
      const emailNorm = trimmed.toLowerCase();
      const isAdminEmail = emailNorm === DEMO_ADMIN_EMAIL.toLowerCase();

      if (isAdminEmail) {
        if (password !== DEMO_ADMIN_PASSWORD) {
          writeLoginLog('login_failure', {
            mode: 'demo',
            reason: 'invalid_credentials',
            detail: 'admin_seed_mismatch',
            maskedEmail: maskEmail(trimmed),
          });
          return of({ ok: false, error: 'Invalid email or password.' });
        }
        const user: UserSession = {
          id: 'demo-admin',
          email: trimmed,
          name: 'Admin',
          role: 'Admin',
        };
        const token = `demo.${crypto.randomUUID()}.${Date.now()}`;
        this.setSession(token, user);
        writeLoginLog('login_success', {
          mode: 'demo',
          userId: user.id,
          maskedEmail: maskEmail(user.email),
          role: 'Admin',
        });
        return of({ ok: true });
      }

      if (password.length < 6) {
        writeLoginLog('login_failure', {
          mode: 'demo',
          reason: 'validation',
          detail: 'password_min_length',
          maskedEmail: maskEmail(trimmed),
        });
        return of({ ok: false, error: 'Password must be at least 6 characters.' });
      }
      const user: UserSession = {
        id: crypto.randomUUID(),
        email: trimmed,
        name: this.displayNameFromEmail(trimmed),
        role: 'User',
      };
      const token = `demo.${crypto.randomUUID()}.${Date.now()}`;
      this.setSession(token, user);
      writeLoginLog('login_success', {
        mode: 'demo',
        userId: user.id,
        maskedEmail: maskEmail(user.email),
        role: 'User',
      });
      return of({ ok: true });
    }

    return this.http
      .post<{ access_token?: string; token?: string; user?: Partial<UserSession> }>(
        `${base}/auth/login`,
        { email: trimmed, password },
      )
      .pipe(
        timeout(15000),
        map((res) => {
          const token = res.access_token ?? res.token ?? '';
          if (!token) {
            writeLoginLog('login_failure', {
              mode: 'api',
              reason: 'no_token_in_response',
              maskedEmail: maskEmail(trimmed),
            });
            return { ok: false as const, error: 'No token in response.' };
          }
          const u = res.user;
          const emailResolved = String(u?.email ?? trimmed);
          const role =
            emailResolved.toLowerCase() === DEMO_ADMIN_EMAIL.toLowerCase() ? 'Admin' : 'User';
          const user: UserSession = {
            id: String(u?.id ?? crypto.randomUUID()),
            email: emailResolved,
            name: String(u?.name ?? this.displayNameFromEmail(trimmed)),
            role,
          };
          this.setSession(token, user);
          writeLoginLog('login_success', {
            mode: 'api',
            userId: user.id,
            maskedEmail: maskEmail(user.email),
          });
          return { ok: true as const };
        }),
        catchError((err: unknown) => {
          const status =
            err && typeof err === 'object' && 'status' in err
              ? Number((err as { status: number }).status)
              : undefined;
          writeLoginLog('login_failure', {
            mode: 'api',
            reason: 'http_error',
            httpStatus: Number.isFinite(status) ? status : 'unknown',
            maskedEmail: maskEmail(trimmed),
          });
          return of({ ok: false as const, error: 'Invalid email or password.' });
        }),
      );
  }

  /**
   * Registers a new user via POST `{apiUrl}/auth/register`.
   * Password is only sent over HTTPS to the server; it is never stored in localStorage.
   * Demo mode (no `apiUrl`): succeeds after client validation only.
   */
  register(payload: RegisterPayload): Observable<LoginResult> {
    const trimmed = payload.email.trim();
    const base = environment.apiUrl?.replace(/\/$/, '');

    if (!base) {
      return of({ ok: true });
    }

    return this.http
      .post<unknown>(`${base}/auth/register`, {
        name: payload.fullName.trim(),
        email: trimmed,
        password: payload.password,
        phone: payload.phone?.trim() || undefined,
        role: 'User',
      })
      .pipe(
        timeout(15000),
        map(() => ({ ok: true as const })),
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse) {
            if (err.status === 409) {
              return of({ ok: false as const, error: 'Email already exists.' });
            }
            const body = err.error as { message?: string; error?: string } | null;
            const msg = typeof body?.message === 'string' ? body.message : body?.error;
            if (typeof msg === 'string') {
              const lower = msg.toLowerCase();
              if (lower.includes('exist') || lower.includes('duplicate') || lower.includes('taken')) {
                return of({ ok: false as const, error: 'Email already exists.' });
              }
            }
          }
          return of({ ok: false as const, error: 'Something went wrong. Please try again.' });
        }),
      );
  }

  /**
   * Signs out: optional server invalidation, clears storage and in-memory auth,
   * resets shared UI state, toast, short delay, then navigates to `/login` with `replaceUrl`.
   */
  async signOut(): Promise<void> {
    const token = this._token();
    const sessionUser = this._user();
    writeLoginLog('logout', {
      maskedEmail: sessionUser ? maskEmail(sessionUser.email) : null,
      userId: sessionUser?.id ?? null,
    });
    this.profilePanel.close();
    this.createFlow.closeAll();

    const base = environment.apiUrl?.replace(/\/$/, '');
    if (token && base) {
      try {
        await firstValueFrom(
          this.http
            .post(`${base}/auth/logout`, {}, {
              headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
            })
            .pipe(timeout(8000), catchError(() => of(null))),
        );
      } catch {
        /* still clear client */
      }
    }

    this.clearStorageOnly();
    this._token.set(null);
    this._user.set(null);

    this.toast.show('You have been successfully logged out');
    await new Promise<void>((r) => setTimeout(r, 500));
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  private clearStorageOnly(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    for (const key of AUTH_LEGACY_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  }

  private displayNameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? email;
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
}

import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, Observable, of, switchMap, timeout } from 'rxjs';
import { map } from 'rxjs/operators';
import { extractMasterDataRows, pickRegisterRoleId } from './auth-register.util';
import { environment } from '../../../environments/environment';
import { CreateFlowService } from '../create-flow/create-flow.service';
import { ProfilePanelService } from '../profile/profile-panel.service';
import { ToastService } from '../toast/toast.service';
import { AUTH_LEGACY_KEYS, AUTH_TOKEN_KEY, AUTH_USER_KEY } from './auth.constants';
import { maskEmail, writeLoginLog } from './login-log';
import {
  buildSessionFromApiRecord,
  homeUrlForRoleId,
  readRoleIdFromJwt,
  readUsersTableRoleId,
  roleIdFromSession,
  ROLE_ID_ADMIN,
  ROLE_ID_USER,
  sessionRoleLabel,
  unwrapApiRecord,
} from './auth-role.util';
import type { RegisterApiRequest, RegisterPayload, UserSession } from './auth.models';

export interface LoginResult {
  ok: boolean;
  error?: string;
  /** Set after login when `users.role_id` is resolved (`/dashboard` or `/user-dashboard`). */
  redirectTo?: string;
}

/** Login API body — `userId` or `user.id` is used for `GET …/auth/users/{id}`. */
interface LoginApiResponse {
  access_token?: string;
  token?: string;
  user?: Record<string, unknown>;
  userId?: string | number;
  roleId?: number;
  role_id?: number;
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
      const normalized = this.normalizeStoredSession(user);
      this._user.set(normalized);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalized));
      writeLoginLog('session_restored', {
        maskedEmail: maskEmail(user.email),
        userId: user.id,
        role: normalized?.role ?? user.role,
        roleId: normalized?.roleId ?? user.roleId,
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
      return of(this.loginDemo(trimmed, password));
    }

    return this.http
      .post<LoginApiResponse>(`${base}/auth/login`, { email: trimmed, password })
      .pipe(
        timeout(15000),
        switchMap((res) => {
          const token = res.access_token ?? res.token ?? '';
          if (!token) {
            writeLoginLog('login_failure', {
              mode: 'api',
              reason: 'no_token_in_response',
              maskedEmail: maskEmail(trimmed),
            });
            return of({ ok: false as const, error: 'No token in response.' });
          }

          const u = res.user;
          const rawUserId = u?.['id'] ?? res.userId;
          const emailResolved = String(u?.['email'] ?? trimmed);
          const serverUserId =
            rawUserId != null && String(rawUserId).trim() !== ''
              ? String(rawUserId)
              : null;

          return this.resolveUsersTableRoleIdAtLogin(base, token, serverUserId, emailResolved, res).pipe(
            map(({ roleId, profile }) => {
              const loginPayload: Record<string, unknown> = {
                ...(u && typeof u === 'object' ? u : {}),
                ...(profile ?? {}),
                ...(serverUserId ? { id: serverUserId } : {}),
                email: emailResolved,
                role_id: roleId,
                roleId,
              };

              const session =
                buildSessionFromApiRecord(loginPayload, emailResolved, roleId) ??
                ({
                  id: serverUserId ?? crypto.randomUUID(),
                  email: emailResolved,
                  name: String(
                    u?.['name'] ?? u?.['fullName'] ?? profile?.['fullName'] ?? this.displayNameFromEmail(trimmed),
                  ),
                  role: sessionRoleLabel(roleId),
                  roleId,
                } satisfies UserSession);

              session.roleId = roleId;
              session.role = sessionRoleLabel(roleId);
              this.setSession(token, session);

              const redirectTo = homeUrlForRoleId(roleId);
              writeLoginLog('login_success', {
                mode: 'api',
                userId: session.id,
                maskedEmail: maskEmail(session.email),
                roleId,
                redirectTo,
              });
              return { ok: true as const, redirectTo };
            }),
          );
        }),
        catchError((err: unknown) => {
          const status =
            err && typeof err === 'object' && 'status' in err
              ? Number((err as { status: number }).status)
              : undefined;
          // Local dev safety net: if API route is missing, fallback to demo login.
          if (status === 404 || status === 0) {
            const fallback = this.loginDemo(trimmed, password);
            writeLoginLog('login_failure', {
              mode: 'api',
              reason: 'http_error_fallback_demo',
              httpStatus: status,
              maskedEmail: maskEmail(trimmed),
            });
            return of(fallback);
          }
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

  private loginDemo(email: string, password: string): LoginResult {
    if (password.length < 6) {
      writeLoginLog('login_failure', {
        mode: 'demo',
        reason: 'validation',
        detail: 'password_min_length',
        maskedEmail: maskEmail(email),
      });
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    const demoAdmin = /@admin\b/i.test(email) || email.toLowerCase().startsWith('admin@');
    const roleId = demoAdmin ? ROLE_ID_ADMIN : ROLE_ID_USER;
    const user: UserSession = {
      id: crypto.randomUUID(),
      email,
      name: this.displayNameFromEmail(email),
      role: demoAdmin ? 'Admin' : 'User',
      roleId,
    };
    const token = `demo.${crypto.randomUUID()}.${Date.now()}`;
    this.setSession(token, user);
    writeLoginLog('login_success', {
      mode: 'demo',
      userId: user.id,
      maskedEmail: maskEmail(user.email),
      roleId: user.roleId,
      redirectTo: homeUrlForRoleId(user.roleId),
    });
    return { ok: true, redirectTo: homeUrlForRoleId(user.roleId) };
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

    return this.resolveRegisterRoleId(base, payload.roleId).pipe(
      switchMap((roleId) => {
        if (roleId == null) {
          return of({
            ok: false as const,
            error:
              'No role configured for registration. Add a role in Master Data or set registerRoleId in environment.development.ts.',
          });
        }

        const body: RegisterApiRequest = {
          fullName: payload.fullName.trim(),
          email: trimmed,
          password: payload.password,
          roleId,
        };
        const phone = payload.phone?.trim();
        if (phone) body.phone = phone;

        return this.http.post<unknown>(`${base}/auth/register`, body).pipe(
          timeout(15000),
          map(() => ({ ok: true as const })),
          catchError((err: unknown) => of(this.mapRegisterHttpError(err))),
        );
      }),
    );
  }

  /** Uses env override, then `GET …/MasterData/roles`, then optional payload roleId. */
  private resolveRegisterRoleId(
    base: string,
    fromPayload?: number | null,
  ): Observable<number | null> {
    const envRole = (environment as { registerRoleId?: number }).registerRoleId;
    if (fromPayload != null && fromPayload > 0) return of(fromPayload);
    if (envRole != null && envRole > 0) return of(envRole);

    return this.http
      .get<unknown>(`${base}/MasterData/roles`, {
        params: new HttpParams().set('activeOnly', 'true'),
      })
      .pipe(
        timeout(10000),
        map((raw) => pickRegisterRoleId(extractMasterDataRows(raw))),
        catchError(() => of(null)),
      );
  }

  private mapRegisterHttpError(err: unknown): LoginResult {
    if (!(err instanceof HttpErrorResponse)) {
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
    if (err.status === 404) {
      return {
        ok: false,
        error:
          'Registration API not found. Start the CRM API on https://localhost:7172 and run the app with ng serve (proxy).',
      };
    }
    if (err.status === 409) {
      return { ok: false, error: 'Email already exists.' };
    }
    const detail = this.httpErrorDetail(err);
    if (detail) {
      const lower = detail.toLowerCase();
      if (lower.includes('exist') || lower.includes('duplicate') || lower.includes('taken')) {
        return { ok: false, error: 'Email already exists.' };
      }
      if (err.status === 400) {
        return { ok: false, error: detail.slice(0, 220) };
      }
      if (err.status >= 500) {
        return {
          ok: false,
          error: `Server error (${err.status}): ${detail.slice(0, 220)}`,
        };
      }
      return { ok: false, error: detail.slice(0, 220) };
    }
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }

  private httpErrorDetail(err: HttpErrorResponse): string | null {
    const body = err.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      const errors = o['errors'];
      if (errors && typeof errors === 'object') {
        const parts: string[] = [];
        for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
          if (Array.isArray(messages)) {
            const text = messages.map((m) => String(m)).join(', ');
            if (text.trim()) parts.push(`${field}: ${text}`);
          } else if (messages != null) {
            parts.push(`${field}: ${String(messages)}`);
          }
        }
        if (parts.length) return parts.join('; ');
      }
      for (const key of ['detail', 'title', 'message', 'error']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return err.message?.trim() || null;
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

  /**
   * Resolves `users.role_id` at login (priority):
   * 1. `GET /auth/users/{id}`
   * 2. `GET /auth/users` (match by id/email)
   * 3. Login response / JWT
   */
  private resolveUsersTableRoleIdAtLogin(
    base: string,
    token: string,
    userId: string | null,
    email: string,
    loginRes: LoginApiResponse,
  ): Observable<{ roleId: number; profile: Record<string, unknown> | null }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    const fromLoginUser = loginRes.user ? readUsersTableRoleId(loginRes.user) : null;
    const fromLoginRoot = readUsersTableRoleId(unwrapApiRecord(loginRes));

    if (!userId) {
      const roleId = fromLoginUser ?? fromLoginRoot ?? readRoleIdFromJwt(token) ?? ROLE_ID_USER;
      return of({ roleId, profile: loginRes.user ?? null });
    }

    return this.http
      .get<unknown>(`${base}/auth/users/${encodeURIComponent(userId)}`, { headers })
      .pipe(
        timeout(15000),
        switchMap((body) => {
          const profile = unwrapApiRecord(body);
          const fromProfile = readUsersTableRoleId(profile);
          if (fromProfile != null) {
            return of({ roleId: fromProfile, profile });
          }

          return this.http.get<unknown>(`${base}/auth/users`, { headers }).pipe(
            timeout(15000),
            map((listBody) => {
              const fromList = this.readRoleIdFromUsersList(listBody, userId, email);
              const roleId =
                fromList ??
                fromLoginUser ??
                fromLoginRoot ??
                readRoleIdFromJwt(token) ??
                ROLE_ID_USER;
              return { roleId, profile };
            }),
            catchError(() =>
              of({
                roleId: fromLoginUser ?? fromLoginRoot ?? readRoleIdFromJwt(token) ?? ROLE_ID_USER,
                profile,
              }),
            ),
          );
        }),
        catchError(() =>
          of({
            roleId: fromLoginUser ?? fromLoginRoot ?? readRoleIdFromJwt(token) ?? ROLE_ID_USER,
            profile: loginRes.user ?? null,
          }),
        ),
      );
  }

  private readRoleIdFromUsersList(
    body: unknown,
    userId: string,
    email: string,
  ): number | null {
    let arr: unknown[] = [];
    if (Array.isArray(body)) {
      arr = body;
    } else {
      const o = unwrapApiRecord(body);
      const raw = o['users'] ?? o['items'] ?? o['data'] ?? o['results'];
      if (Array.isArray(raw)) arr = raw;
    }

    const emailWant = email.trim().toLowerCase();
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const row = unwrapApiRecord(item);
      const rowId = String(row['id'] ?? row['userId'] ?? '').trim();
      const rowEmail = String(row['email'] ?? row['Email'] ?? '')
        .trim()
        .toLowerCase();
      const idMatch = rowId && (rowId === userId || Number(rowId) === Number(userId));
      const emailMatch = emailWant && rowEmail === emailWant;
      if (!idMatch && !emailMatch) continue;
      const roleId = readUsersTableRoleId(row);
      if (roleId != null) return roleId;
    }
    return null;
  }

  /** Re-applies `users.role_id` rules to sessions saved before role mapping was fixed. */
  private normalizeStoredSession(user: UserSession): UserSession {
    const roleId = roleIdFromSession(user);
    return {
      ...user,
      roleId,
      role: sessionRoleLabel(roleId),
    };
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

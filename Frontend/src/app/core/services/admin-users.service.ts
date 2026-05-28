import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import type { RegisterApiRequest } from '../auth/auth.models';
import { readUsersTableRoleId, ROLE_ID_USER, sessionRoleLabel } from '../auth/auth-role.util';
import { environment } from '../../../environments/environment';

export type CreateUserResult = { ok: true } | { ok: false; error: string };
export type DeleteUserResult = { ok: true } | { ok: false; error: string };

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId?: number;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  /**
   * Creates a CRM user via POST `{apiUrl}/auth/register`.
   * Always assigns `roleId: 1` (User — user dashboard access).
   */
  createUser(
    bearerToken: string | null,
    payload: {
      fullName: string;
      email: string;
      password: string;
      phone?: string;
    },
  ): Observable<CreateUserResult> {
    const base = environment.apiUrl?.replace(/\/$/, '');
    if (!base) {
      return of({ ok: true });
    }

    const body: RegisterApiRequest = {
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      password: payload.password,
      roleId: ROLE_ID_USER,
    };
    const phone = payload.phone?.trim();
    if (phone) body.phone = phone;

    const headers =
      bearerToken && bearerToken.length > 0
        ? new HttpHeaders({ Authorization: `Bearer ${bearerToken}` })
        : undefined;

    return this.http.post<unknown>(`${base}/auth/register`, body, { headers }).pipe(
      timeout(15000),
      map(() => ({ ok: true as const })),
      catchError((err: unknown) => of(this.mapCreateUserError(err))),
    );
  }

  /**
   * DELETE `{apiUrl}/auth/users/{id}` with acting admin password in body.
   * `userId` query param is appended by the HTTP interceptor when the session has a numeric id.
   */
  deleteUser(
    bearerToken: string | null,
    targetUserId: string,
    password: string,
  ): Observable<DeleteUserResult> {
    const base = environment.apiUrl?.replace(/\/$/, '');
    if (!base) {
      return of({ ok: true });
    }

    const id = Number(String(targetUserId).trim());
    if (!Number.isFinite(id) || id <= 0) {
      return of({ ok: false, error: 'Invalid user id.' });
    }

    const headers =
      bearerToken && bearerToken.length > 0
        ? new HttpHeaders({ Authorization: `Bearer ${bearerToken}` })
        : undefined;

    return this.http
      .delete<unknown>(`${base}/auth/users/${id}`, {
        headers,
        body: { password },
      })
      .pipe(
        timeout(15000),
        map(() => ({ ok: true as const })),
        catchError((err: unknown) => of(this.mapDeleteUserError(err))),
      );
  }

  /** GET `{apiUrl}/auth/users` (Bearer token when provided). */
  listUsers(bearerToken: string | null): Observable<AdminUserRow[]> {
    const base = environment.apiUrl?.replace(/\/$/, '');
    if (!base) return of([]);

    const headers =
      bearerToken && bearerToken.length > 0
        ? new HttpHeaders({ Authorization: `Bearer ${bearerToken}` })
        : undefined;

    return this.http.get<unknown>(`${base}/auth/users`, { headers }).pipe(
      timeout(30000),
      map((body) => this.normalizeUsersResponse(body)),
    );
  }

  private normalizeUsersResponse(body: unknown): AdminUserRow[] {
    let arr: unknown;
    if (Array.isArray(body)) {
      arr = body;
    } else if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      arr = o['data'] ?? o['users'] ?? o['items'] ?? o['results'];
    }
    if (!Array.isArray(arr)) return [];

    const rows: AdminUserRow[] = [];
    for (const raw of arr) {
      const row = this.mapOneUser(raw);
      if (row) rows.push(row);
    }
    return rows;
  }

  private mapOneUser(raw: unknown): AdminUserRow | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const email = pickStr(o, ['email', 'Email', 'userEmail', 'UserEmail']);
    if (!email) return null;

    const name =
      pickStr(o, ['name', 'Name', 'fullName', 'FullName', 'userName', 'UserName']) ??
      this.nameFromEmail(email);

    const roleRaw = pickStr(o, ['role', 'Role', 'userRole', 'UserRole']) ?? 'User';
    const roleId = readUsersTableRoleId(o) ?? ROLE_ID_USER;

    const id =
      pickStr(o, ['id', 'Id', 'userId', 'UserId']) ?? email;

    const role = sessionRoleLabel(roleId);

    return {
      id,
      name,
      email,
      role,
      roleId,
    };
  }

  private normalizeRoleLabel(role: string): string {
    const r = role.trim();
    if (!r) return 'User';
    const lower = r.toLowerCase();
    if (lower === 'administrator' || lower === 'admin') return 'Admin';
    if (lower === 'manager') return 'Manager';
    if (lower.includes('sales')) return 'Sales User';
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  private nameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? email;
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  private mapDeleteUserError(err: unknown): DeleteUserResult {
    if (!(err instanceof HttpErrorResponse)) {
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
    if (err.status === 401) {
      return { ok: false, error: 'Incorrect password.' };
    }
    if (err.status === 403) {
      return { ok: false, error: 'You do not have permission to delete users.' };
    }
    if (err.status === 404) {
      return { ok: false, error: 'User not found.' };
    }
    const detail = this.httpErrorDetail(err);
    if (detail) {
      if (err.status === 400) {
        return { ok: false, error: detail.slice(0, 220) };
      }
      return { ok: false, error: detail.slice(0, 220) };
    }
    return { ok: false, error: 'Could not delete user. Please try again.' };
  }

  private mapCreateUserError(err: unknown): CreateUserResult {
    if (!(err instanceof HttpErrorResponse)) {
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
    if (err.status === 409) {
      return { ok: false, error: 'Email already exists.' };
    }
    if (err.status === 404) {
      return {
        ok: false,
        error: 'Registration API not found. Start the CRM API and run ng serve with the proxy.',
      };
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
        return { ok: false, error: `Server error (${err.status}): ${detail.slice(0, 220)}` };
      }
      return { ok: false, error: detail.slice(0, 220) };
    }
    if (err.status === 401 || err.status === 403) {
      return { ok: false, error: 'You do not have permission to create users.' };
    }
    return { ok: false, error: 'Could not create user. Please try again.' };
  }

  private httpErrorDetail(err: HttpErrorResponse): string | null {
    const body = err.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      for (const key of ['message', 'Message', 'title', 'Title', 'detail', 'Detail']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      if (o['errors'] && typeof o['errors'] === 'object') {
        const parts: string[] = [];
        for (const [field, msgs] of Object.entries(o['errors'] as Record<string, unknown>)) {
          if (Array.isArray(msgs)) {
            for (const m of msgs) {
              if (typeof m === 'string' && m.trim()) parts.push(`${field}: ${m.trim()}`);
            }
          } else if (typeof msgs === 'string' && msgs.trim()) {
            parts.push(`${field}: ${msgs.trim()}`);
          }
        }
        if (parts.length) return parts.join(' ');
      }
    }
    return err.message?.trim() || null;
  }
}

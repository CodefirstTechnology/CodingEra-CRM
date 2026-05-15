import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
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

    const id =
      pickStr(o, ['id', 'Id', 'userId', 'UserId']) ?? email;

    return {
      id,
      name,
      email,
      role: this.normalizeRoleLabel(roleRaw),
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
}

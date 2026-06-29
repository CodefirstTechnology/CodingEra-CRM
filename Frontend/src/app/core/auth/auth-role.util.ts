import type { UserSession } from './auth.models';
import { parsePermissionsFromApi } from './permission.util';

/**
 * `users.role_id` in the database:
 * - `1` → User dashboard (`/user-dashboard`)
 * - `2` → Admin dashboard (`/dashboard`)
 */
export const ROLE_ID_USER = 1;
export const ROLE_ID_ADMIN = 2;

export type AppRole = 'admin' | 'user';

const USERS_TABLE_ROLE_KEYS = [
  'role_id',
  'roleId',
  'RoleId',
  'Role_ID',
  'userRoleId',
  'UserRoleId',
  'usersRoleId',
  'UsersRoleId',
] as const;

/** Unwraps common API envelopes (`data`, `user`, `result`, …). */
export function unwrapApiRecord(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  const o = body as Record<string, unknown>;
  for (const key of ['data', 'Data', 'result', 'Result', 'user', 'User', 'item', 'Item']) {
    const inner = o[key];
    if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
      return unwrapApiRecord(inner);
    }
  }
  return o;
}

/** Parses `users.role_id` — any positive integer role FK is valid. */
export function coerceUsersTableRoleId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? Math.trunc(value) : Math.trunc(Number(String(value).trim()));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Reads `users.role_id` from an API user object.
 * Does not infer from role display names — numeric id only.
 */
export function readUsersTableRoleId(raw: Record<string, unknown>): number | null {
  for (const key of USERS_TABLE_ROLE_KEYS) {
    const id = coerceUsersTableRoleId(raw[key]);
    if (id != null) return id;
  }

  for (const [key, value] of Object.entries(raw)) {
    if (/role[_]?id/i.test(key)) {
      const id = coerceUsersTableRoleId(value);
      if (id != null) return id;
    }
  }

  const roleVal = raw['role'] ?? raw['Role'];
  if (roleVal == null) return null;

  if (typeof roleVal === 'number' || typeof roleVal === 'string') {
    return coerceUsersTableRoleId(roleVal);
  }

  if (typeof roleVal === 'object') {
    const nested = roleVal as Record<string, unknown>;
    for (const key of ['id', 'Id', 'roleId', 'role_id', 'RoleId']) {
      const id = coerceUsersTableRoleId(nested[key]);
      if (id != null) return id;
    }
  }

  return null;
}

/** Reads `role_id` claim from JWT payload when present. */
export function readRoleIdFromJwt(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json) as Record<string, unknown>;
    return readUsersTableRoleId(payload);
  } catch {
    return null;
  }
}

export function sessionRoleLabel(roleId: number, roleName?: string | null): string {
  if (roleName?.trim()) return roleName.trim();
  return roleId === ROLE_ID_ADMIN ? 'Admin' : 'User';
}

/** Reads dynamic role display name from API user payloads (`crm_roles.name`). */
export function readRoleDisplayNameFromApiRecord(raw: Record<string, unknown>): string | null {
  for (const key of ['roleName', 'RoleName', 'role', 'Role'] as const) {
    const val = raw[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }

  const roleVal = raw['role'] ?? raw['Role'];
  if (roleVal != null && typeof roleVal === 'object' && !Array.isArray(roleVal)) {
    const nested = roleVal as Record<string, unknown>;
    for (const key of ['name', 'Name', 'roleName', 'RoleName']) {
      const val = nested[key];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
  }

  return null;
}

export function homeUrlForRoleId(roleId: number): string {
  return roleId === ROLE_ID_ADMIN ? '/dashboard' : '/user-dashboard';
}

export function roleIdFromSession(user: UserSession | null | undefined): number {
  if (!user) return ROLE_ID_USER;
  const fromId = coerceUsersTableRoleId(user.roleId);
  if (fromId != null) return fromId;
  return roleIdFromRoleLabel(user.role);
}

export function roleIdFromRoleLabel(role: string | undefined | null): number {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'admin' || r === 'administrator' || r.includes('admin')) return ROLE_ID_ADMIN;
  return ROLE_ID_USER;
}

export function appRoleFromSession(user: UserSession | null | undefined): AppRole {
  return roleIdFromSession(user) === ROLE_ID_ADMIN ? 'admin' : 'user';
}

export function isAdmin(user: UserSession | null | undefined): boolean {
  if (!user) return false;
  if ((user.permissions ?? []).some((p) => p.code === 'settings.manage' || p.code === 'roles.manage')) {
    return true;
  }
  const label = (user.role ?? '').trim().toLowerCase();
  if (label === 'admin' || label === 'administrator' || label.includes('admin')) return true;
  return roleIdFromSession(user) === ROLE_ID_ADMIN;
}

/** Admin (role 2) or role label indicating super-admin — can see all quotations. */
export function canViewAllQuotations(user: UserSession | null | undefined): boolean {
  if (isAdmin(user)) return true;
  const label = (user?.role ?? '').trim().toLowerCase();
  return (
    label.includes('super admin') ||
    label.includes('superadmin') ||
    label === 'super_admin' ||
    label === 'super-admin'
  );
}

export function isUser(user: UserSession | null | undefined): boolean {
  return !isAdmin(user);
}

export function hasRole(user: UserSession | null | undefined, roles: readonly AppRole[]): boolean {
  if (!roles.length) return true;
  return roles.includes(appRoleFromSession(user));
}

export function defaultHomeUrl(user: UserSession | null | undefined): string {
  return homeUrlForRoleId(roleIdFromSession(user));
}

export function roleDisplayLabel(user: UserSession | null | undefined): string {
  if (!user) return 'User';
  return sessionRoleLabel(roleIdFromSession(user), user.role);
}

/** Builds session; `roleId` always comes from `users.role_id` when present on the payload. */
export function buildSessionFromApiRecord(
  raw: Record<string, unknown>,
  fallbackEmail: string,
  roleIdOverride?: number | null,
): UserSession | null {
  const idVal = raw['id'] ?? raw['userId'] ?? raw['UserId'];
  const emailVal = raw['email'] ?? raw['Email'];
  const email =
    typeof emailVal === 'string' && emailVal.trim() ? emailVal.trim() : fallbackEmail.trim();
  if (idVal == null || String(idVal).trim() === '') {
    return null;
  }

  let name = '';
  if (typeof raw['name'] === 'string' && raw['name'].trim()) {
    name = raw['name'].trim();
  } else if (typeof raw['fullName'] === 'string' && raw['fullName'].trim()) {
    name = raw['fullName'].trim();
  } else if (typeof raw['FullName'] === 'string' && raw['FullName'].trim()) {
    name = raw['FullName'].trim();
  } else {
    const local = email.split('@')[0] ?? email;
    name = local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  const roleId =
    roleIdOverride != null
      ? roleIdOverride
      : (readUsersTableRoleId(raw) ?? ROLE_ID_USER);

  const roleName = readRoleDisplayNameFromApiRecord(raw);

  const permissions = parsePermissionsFromApi(raw['permissions'] ?? raw['Permissions']);

  return {
    id: String(idVal),
    email,
    name,
    role: sessionRoleLabel(roleId, roleName),
    roleId,
    permissions: permissions.length ? permissions : undefined,
  };
}

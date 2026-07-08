import type { AccessScope, UserPermission } from './permission.models';
import {
  ACCESS_SCOPE_ALL,
  ACCESS_SCOPE_OWN,
  ACCESS_SCOPE_TEAM,
} from './permission.models';
import type { UserSession } from './auth.models';

export function normalizeAccessScope(value: unknown): AccessScope {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'all' || v === 'team' || v === 'own') return v;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (n === ACCESS_SCOPE_ALL) return 'all';
  if (n === ACCESS_SCOPE_TEAM) return 'team';
  return 'own';
}

/** Maps scope to API enum integer (Own=0, Team=1, All=2). */
export function accessScopeToApi(value: AccessScope | string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(2, Math.trunc(value)));
  }
  const normalized = normalizeAccessScope(value);
  if (normalized === 'all') return ACCESS_SCOPE_ALL;
  if (normalized === 'team') return ACCESS_SCOPE_TEAM;
  return ACCESS_SCOPE_OWN;
}

export function parsePermissionsFromApi(raw: unknown): UserPermission[] {
  if (!Array.isArray(raw)) return [];
  const out: UserPermission[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const code = String(o['code'] ?? o['Code'] ?? '').trim().toLowerCase();
    if (!code) continue;
    out.push({
      code,
      module: String(o['module'] ?? o['Module'] ?? '').trim().toLowerCase(),
      action: String(o['action'] ?? o['Action'] ?? '').trim().toLowerCase(),
      accessScope: normalizeAccessScope(o['accessScope'] ?? o['AccessScope']),
    });
  }
  return out;
}

function isAdminRoleLabel(role: string | undefined | null): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'administrator' || r.includes('admin');
}

export function hasPermission(
  user: UserSession | null | undefined,
  code: string,
): boolean {
  if (!user) return false;
  const want = code.trim().toLowerCase();
  if (!want) return true;
  const perms = user.permissions ?? [];
  if (perms.some((p) => p.code === want)) return true;
  // Full access for Admin role (by name or explicit settings.manage permission)
  if (isAdminRoleLabel(user.role)) return true;
  if (perms.some((p) => p.code === 'settings.manage' || p.code === 'roles.manage')) return true;
  return false;
}

export function hasAnyPermission(
  user: UserSession | null | undefined,
  codes: readonly string[],
): boolean {
  if (!codes.length) return true;
  return codes.some((c) => hasPermission(user, c));
}

export function getModuleAccessScope(
  user: UserSession | null | undefined,
  module: string,
): AccessScope {
  const mod = module.trim().toLowerCase();
  const perms = user?.permissions ?? [];
  const view = perms.find(
    (p) => p.module === mod && p.action === 'view',
  );
  if (view) return view.accessScope;
  if (user?.roleId === 2) return 'all';
  return 'own';
}

export function canManageSettings(user: UserSession | null | undefined): boolean {
  return hasAnyPermission(user, ['settings.manage', 'roles.manage']);
}

export function canViewModule(
  user: UserSession | null | undefined,
  module: string,
): boolean {
  if (!user) return false;
  return hasPermission(user, `${module.trim().toLowerCase()}.view`);
}

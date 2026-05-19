import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import {
  appRoleFromSession,
  defaultHomeUrl,
  hasRole,
  type AppRole,
} from '../auth/auth-role.util';

function readAllowedRoles(route: { data?: Record<string, unknown> }): AppRole[] {
  const raw = route.data?.['roles'];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((r) => String(r).trim().toLowerCase())
    .filter((r): r is AppRole => r === 'admin' || r === 'user');
}

/**
 * Restricts routes via `data.roles` (`'admin' | 'user'`).
 * Unauthorized users are sent to their role home (`/dashboard` or `/user-dashboard`).
 */
export const roleGuard: CanMatchFn = (route): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  const allowed = readAllowedRoles(route);

  if (allowed.length === 0) return true;
  if (hasRole(user, allowed)) return true;

  return router.parseUrl(defaultHomeUrl(user));
};

/** Optional helper for templates — current app role slug. */
export function currentAppRole(): AppRole {
  return appRoleFromSession(inject(AuthService).user());
}

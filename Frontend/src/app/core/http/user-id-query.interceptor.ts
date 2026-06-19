import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { SKIP_USER_ID_QUERY } from './skip-user-id-query.context';

const USER_ID_PARAM = 'userId';

function isPositiveIntString(s: string): boolean {
  return /^\d+$/.test(s) && Number(s) > 0;
}

/** Session `user.id`, else optional `environment.apiQueryUserIdFallback` (dev when login omits id). */
function effectiveUserIdForQuery(auth: AuthService): string {
  const raw = auth.user()?.id?.trim();
  if (raw && isPositiveIntString(raw)) return raw;
  const env = environment as { apiQueryUserIdFallback?: string };
  const fb = env.apiQueryUserIdFallback?.trim();
  if (fb && isPositiveIntString(fb)) return fb;
  return '';
}

/** Path-only prefix for CRM calls (handles `apiUrl` as `/api` or `https://host/api`). */
function crmApiPathPrefix(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const p = new URL(trimmed).pathname.replace(/\/$/, '');
      return p || '/';
    } catch {
      return '/api';
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function requestUrlPath(reqUrl: string): string {
  if (reqUrl.startsWith('http://') || reqUrl.startsWith('https://')) {
    try {
      return new URL(reqUrl).pathname;
    } catch {
      return reqUrl;
    }
  }
  const withoutQuery = reqUrl.split('?')[0];
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function isCrmApiPath(pathname: string, prefix: string): boolean {
  const p = pathname;
  const pre = prefix;
  return p === pre || p.startsWith(`${pre}/`);
}

/**
 * Skip only auth routes that cannot send the acting user's id (no session yet).
 * `register` is NOT skipped — OpenAPI allows optional `userId` (e.g. admin creating a user).
 */
function isUnauthenticatedOnlyAuthRoute(pathname: string, prefix: string): boolean {
  const p = pathname.toLowerCase();
  const pre = prefix.toLowerCase();
  if (p === `${pre}/company-profile/branding`) return true;
  const base = `${pre}/auth`;
  if (!p.startsWith(`${base}/`)) return false;
  const rest = p.slice(base.length + 1);
  const segment = rest.split('/')[0] ?? '';
  return ['login', 'forgot-password', 'reset-password', 'refresh'].includes(segment);
}

/**
 * Appends `userId=<database user id>` only when the session holds a **positive integer** string.
 * The CRM API rejects GUIDs in this query parameter (see backend validation).
 *
 * Skips `login` and password/refresh routes only (`forgot-password`, `reset-password`, `refresh`).
 * Uses `environment.apiQueryUserIdFallback` when the session has no numeric id (temporary dev bridge).
 * Does not override an existing `userId` query param on the request.
 */
export const userIdQueryInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const apiPrefix = crmApiPathPrefix(environment.apiUrl?.trim() ? environment.apiUrl : '/api');
  const path = requestUrlPath(req.url);

  if (!isCrmApiPath(path, apiPrefix) || isUnauthenticatedOnlyAuthRoute(path, apiPrefix)) {
    return next(req);
  }

  if (req.context.get(SKIP_USER_ID_QUERY)) {
    return next(req);
  }

  const userId = effectiveUserIdForQuery(auth);

  if (!userId) {
    return next(req);
  }

  if (req.params.has(USER_ID_PARAM)) {
    return next(req);
  }

  const withUser = req.clone({
    params: req.params.append(USER_ID_PARAM, userId),
  });

  return next(withUser);
};

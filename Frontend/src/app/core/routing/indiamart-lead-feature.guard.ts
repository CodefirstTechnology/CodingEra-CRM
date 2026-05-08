import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * When `environment.enableIndiamartLead` is false, the IndiaMART route is not matched
 * (sidebar hidden + deep links redirect to the main dashboard).
 */
export const indiamartLeadFeatureGuard: CanMatchFn = () => {
  if (environment.enableIndiamartLead) {
    return true;
  }
  return inject(Router).parseUrl('/dashboard');
};

/**
 * Legacy deep link `/dashboard/indiamart-leads` → unified Leads.
 * Uses `canActivate` + `UrlTree` because Angular forbids combining `redirectTo` with `canMatch`
 * (redirects run before guards).
 */
export const indiamartLeadsLegacyRedirectGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (environment.enableIndiamartLead) {
    return router.createUrlTree(['/leads']);
  }
  return router.createUrlTree(['/dashboard']);
};

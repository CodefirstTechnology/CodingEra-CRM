import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { defaultHomeUrl } from './auth-role.util';
import { AuthService } from './auth.service';

/** Blocks CRM shell when there is no valid session; sends user to `/login`. */
export const authGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/login');
};

/** Prevents authenticated users from opening the login screen (redirect home). */
export const guestGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl(defaultHomeUrl(auth.user()));
};

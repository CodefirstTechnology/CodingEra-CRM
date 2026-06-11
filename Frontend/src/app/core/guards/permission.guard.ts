import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { PermissionService } from '../services/permission.service';
import { defaultHomeUrl } from '../auth/auth-role.util';
import { AuthService } from '../auth/auth.service';

export const permissionGuard: CanMatchFn = (route) => {
  const permissions = inject(PermissionService);
  const auth = inject(AuthService);
  const router = inject(Router);

  const required = route.data?.['permissions'] as string[] | undefined;
  if (!required?.length) return true;

  if (permissions.hasAny(required)) return true;

  void router.navigateByUrl(defaultHomeUrl(auth.user()));
  return false;
};

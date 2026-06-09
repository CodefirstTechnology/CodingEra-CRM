import { computed, inject, Injectable } from '@angular/core';
import { isAdmin } from '../auth/auth-role.util';
import { AuthService } from '../auth/auth.service';
import {
  canManageSettings,
  canViewModule,
  getModuleAccessScope,
  hasAnyPermission,
  hasPermission,
} from '../auth/permission.util';
import type { AccessScope } from '../auth/permission.models';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);

  readonly permissions = computed(() => this.auth.user()?.permissions ?? []);

  has(code: string): boolean {
    return hasPermission(this.auth.user(), code);
  }

  hasAny(codes: readonly string[]): boolean {
    return hasAnyPermission(this.auth.user(), codes);
  }

  canViewModule(module: string): boolean {
    return canViewModule(this.auth.user(), module);
  }

  canManageSettings(): boolean {
    return canManageSettings(this.auth.user());
  }

  moduleScope(module: string): AccessScope {
    return getModuleAccessScope(this.auth.user(), module);
  }

  canViewAllRecords(): boolean {
    const user = this.auth.user();
    if (!user) return false;
    if (canManageSettings(user)) return true;
    return isAdmin(user);
  }

  /** True when the user’s `{module}.view` permission has All scope (or is Admin). */
  canViewAllForModule(module: string): boolean {
    if (this.canViewAllRecords()) return true;
    return this.moduleScope(module) === 'all';
  }

  canAssignLeads(): boolean {
    return this.has('leads.assign');
  }

  canAssignDeals(): boolean {
    return this.has('deals.assign');
  }

  canSelfAssignLeads(): boolean {
    return this.has('leads.self_assign');
  }

  canSelfAssignDeals(): boolean {
    return this.has('deals.self_assign');
  }
}

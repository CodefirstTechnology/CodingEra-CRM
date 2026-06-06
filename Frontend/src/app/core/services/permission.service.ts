import { computed, inject, Injectable } from '@angular/core';
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
    if (hasPermission(user, 'settings.manage')) return true;
    return (user.permissions ?? []).some((p) => p.accessScope === 'all');
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

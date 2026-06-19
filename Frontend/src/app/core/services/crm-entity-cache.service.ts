import { effect, inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { isAdmin } from '../auth/auth-role.util';
import { getModuleAccessScope } from '../auth/permission.util';
import { AuthService } from '../auth/auth.service';
import { CreateRowBusService } from '../create-flow/create-row-bus.service';
import type { AdminUserRow } from './admin-users.service';
import { AdminUsersService } from './admin-users.service';
import { DealsService } from './deals.service';
import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow } from '../../features/leads/lead-row.model';
import { LeadsService } from './leads.service';

/**
 * Short-lived in-memory cache for list endpoints used by dashboard, notifications, and task enrichment.
 * Cleared on login user change, entity create, or explicit {@link invalidate}.
 */
@Injectable({ providedIn: 'root' })
export class CrmEntityCacheService {
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly createBus = inject(CreateRowBusService);

  private cacheKey = '';
  private readonly entries = new Map<string, Observable<unknown>>();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      const uid = user?.id?.trim() ?? '';
      const key = `${uid}:${isAdmin(user) ? 'admin' : 'user'}`;
      if (key !== this.cacheKey) {
        this.cacheKey = key;
        this.clearEntries();
      }
    });

    this.createBus.created$.subscribe(() => this.invalidate());
  }

  invalidate(): void {
    this.clearEntries();
    this.adminUsers.invalidateListCache();
  }

  listUsers(): Observable<AdminUserRow[]> {
    return this.cached('users', () => this.adminUsers.listUsers(this.auth.token()));
  }

  listLeads(): Observable<LeadRow[]> {
    return this.cached(this.scopeKey('leads'), () => this.loadLeads());
  }

  listDeals(): Observable<DealRow[]> {
    return this.cached(this.scopeKey('deals'), () => this.loadDeals());
  }

  private scopeKey(entity: string): string {
    const user = this.auth.user();
    const uid = user?.id?.trim() ?? 'anon';
    const mod = entity === 'leads' ? 'leads' : entity === 'deals' ? 'deals' : entity;
    const scoped =
      !user?.id?.trim() || isAdmin(user) || getModuleAccessScope(user, mod) === 'all' ? 'all' : uid;
    return `${entity}:${scoped}`;
  }

  private loadLeads(): Observable<LeadRow[]> {
    const user = this.auth.user();
    if (!user?.id?.trim() || isAdmin(user) || getModuleAccessScope(user, 'leads') === 'all') {
      return this.leadsService.getAll();
    }
    return this.leadsService.getAssignedToUser(user.id, user.name, user.email);
  }

  private loadDeals(): Observable<DealRow[]> {
    const user = this.auth.user();
    if (!user?.id?.trim() || isAdmin(user) || getModuleAccessScope(user, 'deals') === 'all') {
      return this.dealsService.getAll();
    }
    return this.dealsService.getAssignedToUser(user.id, user.name, user.email);
  }

  private cached<T>(key: string, factory: () => Observable<T>): Observable<T> {
    let hit = this.entries.get(key) as Observable<T> | undefined;
    if (!hit) {
      hit = factory().pipe(shareReplay(1));
      this.entries.set(key, hit);
    }
    return hit;
  }

  private clearEntries(): void {
    this.entries.clear();
  }
}

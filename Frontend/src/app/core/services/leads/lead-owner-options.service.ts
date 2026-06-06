import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, take } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ROLE_ID_ADMIN } from '../../auth/auth-role.util';
import { AdminUsersService, type AdminUserRow } from '../admin-users.service';
import type { DealPipelineStatus, DealRow } from '../../../features/deals/deals.component';
import type { LeadOwnerOption, LeadRow } from '../../../features/leads/lead-row.model';

export function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function adminUserToLeadOwnerOption(user: AdminUserRow): LeadOwnerOption {
  const label = user.name.trim() || user.email.trim();
  return {
    id: user.id.trim(),
    label,
    initials: initialsFromDisplayName(label),
  };
}

/** Admins (`users.role_id` = 2) are excluded from lead owner assignment and round-robin. */
export function isLeadAssignableUser(user: AdminUserRow): boolean {
  return user.roleId !== ROLE_ID_ADMIN;
}

/** True when the row id is a numeric CRM/API lead (not local-only marketplace prefix ids). */
export function isPersistedApiLeadRow(id: string): boolean {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 && !id.startsWith('im-') && !id.startsWith('jd-') && !id.startsWith('ti-');
}

@Injectable({ providedIn: 'root' })
export class LeadOwnerOptionsService {
  private readonly adminUsers = inject(AdminUsersService);
  private readonly auth = inject(AuthService);

  private readonly optionsSignal = signal<LeadOwnerOption[]>([]);
  private readonly loadedSignal = signal(false);
  private load$?: Observable<readonly LeadOwnerOption[]>;

  readonly options = this.optionsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();

  private lastSessionUserId: string | null = null;

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.id?.trim() ?? '';
      if (uid === this.lastSessionUserId) return;
      untracked(() => {
        this.lastSessionUserId = uid;
        this.reset();
      });
    });
  }

  load(): void {
    this.ensureLoaded().pipe(take(1)).subscribe();
  }

  /** Resolves when owner options are in memory (required before marketplace bulk save + round robin). */
  ensureLoaded(): Observable<readonly LeadOwnerOption[]> {
    if (this.loadedSignal()) {
      return of(this.optionsSignal());
    }
    if (!this.load$) {
      this.load$ = this.adminUsers.listUsers(this.auth.token()).pipe(
        map((users) => {
          const opts = users.filter(isLeadAssignableUser).map(adminUserToLeadOwnerOption);
          this.optionsSignal.set(opts);
          this.loadedSignal.set(true);
          return opts;
        }),
        catchError(() => {
          this.optionsSignal.set([]);
          this.loadedSignal.set(true);
          return of([] as LeadOwnerOption[]);
        }),
        shareReplay(1),
      );
    }
    return this.load$;
  }

  private reset(): void {
    this.loadedSignal.set(false);
    this.optionsSignal.set([]);
    this.load$ = undefined;
  }

  findById(id: string | undefined | null): LeadOwnerOption | undefined {
    if (id == null || !String(id).trim()) return undefined;
    const want = String(id).trim();
    return this.optionsSignal().find((o) => this.idsMatch(o.id, want));
  }

  findByLabel(label: string | undefined | null): LeadOwnerOption | undefined {
    const want = label?.trim().toLowerCase();
    if (!want) return undefined;
    return this.optionsSignal().find((o) => o.label.trim().toLowerCase() === want);
  }

  private idsMatch(a: string, b: string): boolean {
    if (a === b) return true;
    const an = Number(a);
    const bn = Number(b);
    return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
  }

  defaultOwnerId(): string {
    const sessionId = this.auth.user()?.id?.trim();
    if (sessionId) {
      return sessionId;
    }
    return this.optionsSignal()[0]?.id ?? '';
  }

  sessionOwnerId(): string {
    return this.auth.user()?.id?.trim() ?? '';
  }

  sessionOwnerDisplay(): { id: string; label: string; initials: string } {
    const id = this.sessionOwnerId();
    const opt = id ? this.findById(id) : undefined;
    if (opt) {
      return { id: opt.id, label: opt.label, initials: opt.initials };
    }
    const user = this.auth.user();
    const label = user?.name?.trim() || user?.email?.trim() || 'You';
    return { id, label, initials: initialsFromDisplayName(label) };
  }

  applyOwnerToRow(row: LeadRow): LeadRow {
    let ownerId = row.leadOwnerId?.trim() || undefined;
    let opt = ownerId ? this.findById(ownerId) : undefined;
    if (!opt && row.leadOwnerName?.trim()) {
      opt = this.findByLabel(row.leadOwnerName);
      if (opt) ownerId = opt.id;
    }
    if (opt) {
      return {
        ...row,
        leadOwnerId: ownerId ?? opt.id,
        leadOwnerName: opt.label,
        owner: opt.initials,
      };
    }
    const name = row.leadOwnerName?.trim() ?? '';
    if (name && !name.startsWith('User #')) {
      return {
        ...row,
        owner: row.owner?.trim() || initialsFromDisplayName(name),
      };
    }
    return row;
  }

  /** Value for &lt;select&gt; when API returns owner name but not id on list GET. */
  resolveSelectValue(row: LeadRow): string {
    const id = row.leadOwnerId?.trim();
    if (id && this.findById(id)) return id;
    const byName = this.findByLabel(row.leadOwnerName);
    return byName?.id ?? id ?? '';
  }

  enrichRows(rows: readonly LeadRow[]): LeadRow[] {
    return rows.map((r) => this.applyOwnerToRow(r));
  }

  applyOwnerToDealRow(row: DealRow): DealRow {
    let ownerId = row.dealOwnerId?.trim() || row.assignedToUserId?.trim() || undefined;
    let opt = ownerId ? this.findById(ownerId) : undefined;
    if (!opt && row.assignedTo?.trim()) {
      opt = this.findByLabel(row.assignedTo);
      if (opt) ownerId = opt.id;
    }
    if (opt) {
      return {
        ...row,
        dealOwnerId: ownerId ?? opt.id,
        assignedToUserId: ownerId ?? opt.id,
        assignedTo: opt.label,
        assignedInitials: opt.initials,
      };
    }
    const name = row.assignedTo?.trim() ?? '';
    if (name && !name.startsWith('User #')) {
      return {
        ...row,
        assignedInitials: row.assignedInitials?.trim() || initialsFromDisplayName(name),
      };
    }
    return row;
  }

  resolveDealSelectValue(row: DealRow): string {
    const id = row.dealOwnerId?.trim() || row.assignedToUserId?.trim();
    if (id && this.findById(id)) return id;
    const byName = this.findByLabel(row.assignedTo);
    return byName?.id ?? id ?? '';
  }

  enrichDealRows(rows: readonly DealRow[]): DealRow[] {
    return rows.map((r) => this.applyOwnerToDealRow(r));
  }
}

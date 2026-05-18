import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, take } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AdminUsersService, type AdminUserRow } from '../admin-users.service';
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

  readonly options = this.optionsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();

  load(): void {
    this.ensureLoaded().pipe(take(1)).subscribe();
  }

  /** Resolves when owner options are in memory (required before marketplace bulk save + round robin). */
  ensureLoaded(): Observable<readonly LeadOwnerOption[]> {
    if (this.loadedSignal()) {
      return of(this.optionsSignal());
    }
    return this.adminUsers.listUsers(this.auth.token()).pipe(
      map((users) => {
        const opts = users.map(adminUserToLeadOwnerOption);
        this.optionsSignal.set(opts);
        this.loadedSignal.set(true);
        return opts;
      }),
      catchError(() => {
        this.optionsSignal.set([]);
        this.loadedSignal.set(true);
        return of([] as LeadOwnerOption[]);
      }),
    );
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
    const opts = this.optionsSignal();
    const sessionId = this.auth.user()?.id?.trim();
    if (sessionId && opts.some((o) => o.id === sessionId)) {
      return sessionId;
    }
    return opts[0]?.id ?? '';
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
    if (row.leadOwnerId && row.leadOwnerName.startsWith('User #')) {
      return { ...row, leadOwnerName: '', owner: '' };
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
    if (this.optionsSignal().length === 0) return [...rows];
    return rows.map((r) => this.applyOwnerToRow(r));
  }
}

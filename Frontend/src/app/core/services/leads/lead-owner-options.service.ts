import { inject, Injectable, signal } from '@angular/core';
import { take } from 'rxjs';
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
    this.adminUsers.listUsers(this.auth.token()).pipe(take(1)).subscribe({
      next: (users) => {
        this.optionsSignal.set(users.map(adminUserToLeadOwnerOption));
        this.loadedSignal.set(true);
      },
      error: () => {
        this.optionsSignal.set([]);
        this.loadedSignal.set(true);
      },
    });
  }

  findById(id: string | undefined | null): LeadOwnerOption | undefined {
    if (id == null || !String(id).trim()) return undefined;
    return this.optionsSignal().find((o) => o.id === String(id).trim());
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
    const opt = row.leadOwnerId ? this.findById(row.leadOwnerId) : undefined;
    if (opt) {
      return { ...row, leadOwnerName: opt.label, owner: opt.initials };
    }
    if (row.leadOwnerId && row.leadOwnerName.startsWith('User #')) {
      return { ...row, leadOwnerName: '', owner: '' };
    }
    return row;
  }

  enrichRows(rows: readonly LeadRow[]): LeadRow[] {
    if (this.optionsSignal().length === 0) return [...rows];
    return rows.map((r) => this.applyOwnerToRow(r));
  }
}

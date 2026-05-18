import { inject, Injectable } from '@angular/core';
import type { LeadOwnerOption, LeadRow } from '../../../features/leads/lead-row.model';
import type { LeadUpsertDto } from './lead-api.models';
import { LeadOwnerOptionsService } from './lead-owner-options.service';

const STORAGE_KEY = 'crm.leadRoundRobin.nextIndex';

/**
 * Distributes new lead owners across CRM users in order (1st lead → 1st user, …, then wraps).
 * Index is persisted in localStorage so assignment continues across sessions.
 */
@Injectable({ providedIn: 'root' })
export class LeadRoundRobinService {
  private readonly ownerOpts = inject(LeadOwnerOptionsService);

  /** Next owner for a new lead (does not advance the counter). */
  peekNextOwner(): LeadOwnerOption | undefined {
    const owners = this.ownerOpts.options();
    if (owners.length === 0) return undefined;
    return owners[this.readIndex() % owners.length];
  }

  /** User id for create forms; falls back to session/default owner when RR is unavailable. */
  nextOwnerIdForForm(): string {
    return this.peekNextOwner()?.id ?? this.ownerOpts.defaultOwnerId();
  }

  /** Call after a lead is successfully created and saved to the API. */
  advanceAfterLeadCreated(): void {
    const len = this.ownerOpts.options().length;
    if (len === 0) return;
    this.writeIndex(this.readIndex() + 1);
  }

  /**
   * On first visit, align the pointer with how many leads already exist so the next
   * assignment continues the sequence instead of always starting at user 1.
   */
  seedIndexFromExistingLeadCount(totalLeads: number): void {
    if (localStorage.getItem(STORAGE_KEY) != null) return;
    const len = this.ownerOpts.options().length;
    if (len === 0) return;
    const count = Math.max(0, Math.floor(totalLeads));
    this.writeIndex(count % len);
  }

  applyOwnerIfMissing<T extends Pick<LeadRow, 'leadOwnerId' | 'leadOwnerName' | 'owner'>>(
    data: T,
  ): T {
    if (data.leadOwnerId?.trim()) return data;
    const opt = this.peekNextOwner();
    if (!opt) return data;
    return {
      ...data,
      leadOwnerId: opt.id,
      leadOwnerName: opt.label,
      owner: opt.initials,
    };
  }

  applyToUpsertDto(dto: LeadUpsertDto): LeadUpsertDto {
    if (dto.leadOwnerId != null && dto.leadOwnerId > 0) return dto;
    const opt = this.peekNextOwner();
    if (!opt) return dto;
    const id = Number(opt.id);
    if (!Number.isFinite(id) || id <= 0) return dto;
    return { ...dto, leadOwnerId: id };
  }

  private readIndex(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw != null ? Number(raw) : NaN;
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  private writeIndex(i: number): void {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(i))));
    } catch {
      /* ignore quota / private mode */
    }
  }
}

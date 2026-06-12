import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

const STORAGE_PREFIX = 'crm-morning-briefing-played';

@Injectable({ providedIn: 'root' })
export class MorningBriefingStorageService {
  private readonly auth = inject(AuthService);

  private todayKey(): string | null {
    const userId = this.auth.user()?.id?.trim();
    if (!userId) return null;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${STORAGE_PREFIX}:${userId}:${y}-${m}-${d}`;
  }

  wasAutoPlayedToday(): boolean {
    const key = this.todayKey();
    if (!key || typeof localStorage === 'undefined') return false;
    return localStorage.getItem(key) === '1';
  }

  markAutoPlayedToday(): void {
    const key = this.todayKey();
    if (!key || typeof localStorage === 'undefined') return;
    localStorage.setItem(key, '1');
    this.pruneOldKeys();
  }

  /** Clears cached auto-play flag (does not affect server-side last played date). */
  clearTodayCache(): void {
    const key = this.todayKey();
    if (!key || typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }

  isSameCalendarDay(isoDate: string | null | undefined): boolean {
    if (!isoDate?.trim()) return false;
    const played = isoDate.trim().slice(0, 10);
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return played === `${y}-${m}-${d}`;
  }

  private pruneOldKeys(): void {
    if (typeof localStorage === 'undefined') return;
    const userId = this.auth.user()?.id?.trim();
    if (!userId) return;
    const prefix = `${STORAGE_PREFIX}:${userId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix) && k !== this.todayKey()) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

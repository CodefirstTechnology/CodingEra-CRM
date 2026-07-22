import { Injectable } from '@angular/core';
import { columnOrderStorageKey } from './column-order.utils';

/**
 * localStorage persistence for column order arrays.
 * Visibility must use a separate key / service — do not mix.
 */
@Injectable({ providedIn: 'root' })
export class ColumnOrderStorageService {
  /** Returns parsed string ids, or `null` when missing / invalid. */
  load(prefix: string, userId: string | null | undefined): string[] | null {
    const key = columnOrderStorageKey(prefix, userId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw?.trim()) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const ids = parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      return ids.length > 0 ? ids : null;
    } catch {
      return null;
    }
  }

  save(prefix: string, userId: string | null | undefined, order: readonly string[]): void {
    const key = columnOrderStorageKey(prefix, userId);
    try {
      localStorage.setItem(key, JSON.stringify([...order]));
    } catch {
      /* quota / private browsing */
    }
  }

  clear(prefix: string, userId: string | null | undefined): void {
    const key = columnOrderStorageKey(prefix, userId);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

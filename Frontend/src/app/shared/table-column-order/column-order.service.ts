import { Injectable, inject } from '@angular/core';
import { ColumnOrderStorageService } from './column-order-storage.service';
import type { ColumnOrderConfig } from './column-order.types';
import { mergeColumnOrder, reorderColumnIds } from './column-order.utils';

/**
 * Facade for resolving, persisting, and resetting table column order.
 * Tables only pass {@link ColumnOrderConfig} + available column ids.
 */
@Injectable({ providedIn: 'root' })
export class ColumnOrderService {
  private readonly storage = inject(ColumnOrderStorageService);

  /**
   * Load saved order (if any), merge with preferred + available, return display order.
   * Does not write storage.
   */
  resolveOrder(config: ColumnOrderConfig, availableIds: readonly string[]): string[] {
    const saved = this.storage.load(config.storageKeyPrefix, config.getUserId());
    return mergeColumnOrder(config.preferredOrder, availableIds, saved);
  }

  /**
   * Re-merge an in-memory order when available columns change
   * (append new columns; drop removed ones). Persists the result.
   */
  syncOrder(
    config: ColumnOrderConfig,
    availableIds: readonly string[],
    currentOrder: readonly string[],
  ): string[] {
    const merged = mergeColumnOrder(config.preferredOrder, availableIds, currentOrder);
    this.storage.save(config.storageKeyPrefix, config.getUserId(), merged);
    return merged;
  }

  /** Persist an explicit order (after drag). */
  saveOrder(config: ColumnOrderConfig, order: readonly string[]): void {
    this.storage.save(config.storageKeyPrefix, config.getUserId(), order);
  }

  /** Apply a drag move and persist. */
  applyReorder(
    config: ColumnOrderConfig,
    order: readonly string[],
    fromIndex: number,
    toIndex: number,
  ): string[] {
    const next = reorderColumnIds(order, fromIndex, toIndex);
    this.storage.save(config.storageKeyPrefix, config.getUserId(), next);
    return next;
  }

  /**
   * Clear persisted order and return preferred-based merge.
   * Does not touch visibility preferences.
   */
  resetOrder(config: ColumnOrderConfig, availableIds: readonly string[]): string[] {
    this.storage.clear(config.storageKeyPrefix, config.getUserId());
    return mergeColumnOrder(config.preferredOrder, availableIds, null);
  }
}

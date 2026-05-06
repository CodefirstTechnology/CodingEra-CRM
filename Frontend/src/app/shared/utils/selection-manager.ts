import { computed, signal, type WritableSignal } from '@angular/core';

export interface IdSelection {
  readonly selectedIds: WritableSignal<Set<string>>;
  readonly selectedCount: ReturnType<typeof computed<number>>;
  /** Selected row ids (stable copy for iteration). */
  readonly selectedItems: ReturnType<typeof computed<string[]>>;
  isSelected(id: string): boolean;
  toggle(id: string): void;
  clear(): void;
  /** Replace selection with exactly these ids. */
  selectAll(ids: string[]): void;
  /** If every id in the list is selected, clear; otherwise select the full list. */
  toggleSelectAll(ids: string[]): void;
  allSelectedIn(ids: string[]): boolean;
  removeId(id: string): void;
}

/**
 * Reusable selection state for list rows keyed by string `id` (e.g. numeric ids as strings).
 */
export function createIdSelection(): IdSelection {
  const selectedIds = signal<Set<string>>(new Set());
  const selectedCount = computed(() => selectedIds().size);
  const selectedItems = computed(() => [...selectedIds()]);

  return {
    selectedIds,
    selectedCount,
    selectedItems,
    isSelected(id: string): boolean {
      return selectedIds().has(id);
    },
    toggle(id: string): void {
      selectedIds.update((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    clear(): void {
      selectedIds.set(new Set());
    },
    selectAll(ids: string[]): void {
      selectedIds.set(new Set(ids));
    },
    toggleSelectAll(ids: string[]): void {
      if (ids.length === 0) {
        selectedIds.set(new Set());
        return;
      }
      const cur = selectedIds();
      const allOn = ids.every((i) => cur.has(i));
      selectedIds.set(allOn ? new Set() : new Set(ids));
    },
    allSelectedIn(ids: string[]): boolean {
      return ids.length > 0 && ids.every((i) => selectedIds().has(i));
    },
    removeId(id: string): void {
      selectedIds.update((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  };
}

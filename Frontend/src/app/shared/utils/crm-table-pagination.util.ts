import { computed, effect, type Signal, signal, type WritableSignal } from '@angular/core';
import {
  CRM_TABLE_DEFAULT_PAGE_SIZE,
  CRM_TABLE_PAGE_SIZE_OPTIONS,
  type PaginationPageToken,
} from '../components/crm-pagination-footer/crm-table-pagination.model';

export interface ClientTablePaginationState<T> {
  readonly page: WritableSignal<number>;
  readonly pageSize: WritableSignal<number>;
  readonly totalItems: Signal<number>;
  readonly totalPages: Signal<number>;
  readonly paginatedItems: Signal<readonly T[]>;
  readonly rangeStart: Signal<number>;
  readonly rangeEnd: Signal<number>;
  setPage(page: number): void;
  setPageSize(size: number): void;
  resetPage(): void;
}

export interface ClientTablePaginationOptions {
  defaultPageSize?: number;
}

/** Client-side table pagination over a filtered item signal. */
export function createClientTablePagination<T>(
  items: Signal<readonly T[]>,
  options: ClientTablePaginationOptions = {},
): ClientTablePaginationState<T> {
  const defaultPageSize = normalizePageSize(options.defaultPageSize ?? CRM_TABLE_DEFAULT_PAGE_SIZE);
  const page = signal(0);
  const pageSize = signal(defaultPageSize);

  const totalItems = computed(() => items().length);
  const totalPages = computed(() => Math.max(1, Math.ceil(totalItems() / pageSize())));

  const paginatedItems = computed(() => {
    const all = items();
    const start = page() * pageSize();
    return all.slice(start, start + pageSize());
  });

  const rangeStart = computed(() => (totalItems() === 0 ? 0 : page() * pageSize() + 1));
  const rangeEnd = computed(() => Math.min(totalItems(), (page() + 1) * pageSize()));

  effect(() => {
    const max = totalPages() - 1;
    if (page() > max) page.set(Math.max(0, max));
  });

  function setPage(next: number): void {
    const max = totalPages() - 1;
    page.set(Math.min(Math.max(0, next), max));
  }

  function setPageSize(size: number): void {
    pageSize.set(normalizePageSize(size));
    page.set(0);
  }

  function resetPage(): void {
    page.set(0);
  }

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    paginatedItems,
    rangeStart,
    rangeEnd,
    setPage,
    setPageSize,
    resetPage,
  };
}

export function normalizePageSize(size: number): number {
  const n = Math.trunc(size);
  return CRM_TABLE_PAGE_SIZE_OPTIONS.includes(n as (typeof CRM_TABLE_PAGE_SIZE_OPTIONS)[number])
    ? n
    : CRM_TABLE_DEFAULT_PAGE_SIZE;
}

/** Build a compact page-number strip with ellipsis for long page ranges. */
export function buildVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible = 7,
): PaginationPageToken[] {
  if (totalPages <= 1) return [0];
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pages = new Set<number>([0, totalPages - 1, currentPage]);
  if (currentPage > 0) pages.add(currentPage - 1);
  if (currentPage < totalPages - 1) pages.add(currentPage + 1);

  if (currentPage <= 2) {
    pages.add(1);
    pages.add(2);
  }
  if (currentPage >= totalPages - 3) {
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PaginationPageToken[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(sorted[i]);
  }
  return result;
}

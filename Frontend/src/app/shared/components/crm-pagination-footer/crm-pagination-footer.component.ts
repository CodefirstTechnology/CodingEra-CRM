import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CRM_TABLE_DEFAULT_PAGE_SIZE,
  CRM_TABLE_PAGE_SIZE_OPTIONS,
  type PaginationPageToken,
} from './crm-table-pagination.model';
import { buildVisiblePageNumbers, normalizePageSize } from '../../utils/crm-table-pagination.util';

@Component({
  selector: 'app-crm-pagination-footer, app-crm-table-pagination',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './crm-pagination-footer.component.html',
  styleUrl: './crm-pagination-footer.component.scss',
})
export class CrmPaginationFooterComponent {
  /** Zero-based current page index. */
  readonly page = input.required<number>();
  /** Total record count (preferred). */
  readonly totalItems = input(0);
  /** Legacy input — used when totalItems is not supplied. */
  readonly totalPages = input(0);
  readonly pageSize = input(CRM_TABLE_DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = input<readonly number[]>(CRM_TABLE_PAGE_SIZE_OPTIONS);
  readonly ariaLabel = input('Pagination');

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly pageJumpInput = signal('');

  protected readonly resolvedTotalPages = computed(() => {
    const explicit = this.totalPages();
    const count = this.totalItems();
    const size = this.effectivePageSize();
    if (count > 0) return Math.max(1, Math.ceil(count / size));
    return Math.max(1, explicit || 1);
  });

  protected readonly resolvedTotalItems = computed(() => {
    const count = this.totalItems();
    if (count > 0) return count;
    return this.resolvedTotalPages() * this.effectivePageSize();
  });

  protected readonly rangeStart = computed(() => {
    const total = this.resolvedTotalItems();
    if (total === 0) return 0;
    return this.page() * this.effectivePageSize() + 1;
  });

  protected readonly rangeEnd = computed(() =>
    Math.min(this.resolvedTotalItems(), (this.page() + 1) * this.effectivePageSize()),
  );

  protected readonly visiblePages = computed((): PaginationPageToken[] =>
    buildVisiblePageNumbers(this.page(), this.resolvedTotalPages()),
  );

  protected readonly pageSizeChoices = computed(() => {
    const options = this.pageSizeOptions();
    const current = this.effectivePageSize();
    const merged = new Set(options);
    merged.add(current);
    return [...merged].sort((a, b) => a - b);
  });

  protected first(): void {
    if (this.page() <= 0) return;
    this.pageChange.emit(0);
  }

  protected prev(): void {
    if (this.page() <= 0) return;
    this.pageChange.emit(this.page() - 1);
  }

  protected next(): void {
    if (this.page() >= this.resolvedTotalPages() - 1) return;
    this.pageChange.emit(this.page() + 1);
  }

  protected last(): void {
    const lastPage = this.resolvedTotalPages() - 1;
    if (this.page() >= lastPage) return;
    this.pageChange.emit(lastPage);
  }

  protected goToPage(index: number): void {
    const lastPage = this.resolvedTotalPages() - 1;
    const next = Math.min(Math.max(0, index), lastPage);
    if (next === this.page()) return;
    this.pageChange.emit(next);
  }

  protected onPageSizeChange(value: string | number): void {
    const size = normalizePageSize(Number(value));
    if (size === this.effectivePageSize()) return;
    this.pageSizeChange.emit(size);
  }

  protected onPageJumpInput(ev: Event): void {
    this.pageJumpInput.set((ev.target as HTMLInputElement).value);
  }

  protected submitPageJump(ev: Event): void {
    ev.preventDefault();
    const raw = this.pageJumpInput().trim();
    if (!raw) return;
    const oneBased = Math.trunc(Number(raw));
    if (!Number.isFinite(oneBased) || oneBased < 1) return;
    this.goToPage(oneBased - 1);
    this.pageJumpInput.set('');
  }

  protected pageTokenLabel(token: PaginationPageToken): string {
    return token === 'ellipsis' ? '…' : String(token + 1);
  }

  protected isCurrentPage(token: PaginationPageToken): boolean {
    return token !== 'ellipsis' && token === this.page();
  }

  private effectivePageSize(): number {
    return normalizePageSize(this.pageSize());
  }
}

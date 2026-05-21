import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-crm-pagination-footer',
  standalone: true,
  templateUrl: './crm-pagination-footer.component.html',
  styleUrl: './crm-pagination-footer.component.scss',
})
export class CrmPaginationFooterComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageChange = output<number>();
  readonly ariaLabel = input('Pagination');

  protected prev(): void {
    if (this.page() <= 0) return;
    this.pageChange.emit(this.page() - 1);
  }

  protected next(): void {
    if (this.page() >= this.totalPages() - 1) return;
    this.pageChange.emit(this.page() + 1);
  }
}

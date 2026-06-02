import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import {
  QUOTATION_STATUSES,
  type QuotationListItem,
  type QuotationStatus,
} from '../../core/services/quotations/quotation-api.models';
import { QuotationsService, quotationHttpErrorMessage } from '../../core/services/quotations.service';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-quotations-list',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './quotations-list.component.html',
  styleUrl: './quotations-list.component.scss',
})
export class QuotationsListComponent {
  private readonly quotationsService = inject(QuotationsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<QuotationListItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly statusOptions = QUOTATION_STATUSES;

  protected readonly filterForm = this.fb.nonNullable.group({
    status: [''],
    search: [''],
  });

  constructor() {
    this.refresh();
    this.filterForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyClientFilter());
  }

  protected refresh(): void {
    this.loading.set(true);
    const status = this.filterForm.controls.status.value?.trim();
    this.quotationsService
      .list(status ? { status } : undefined)
      .pipe(take(1))
      .subscribe({
        next: (list) => {
          this.allRows = list;
          this.applyClientFilter();
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.toast.error(quotationHttpErrorMessage(err, 'Failed to load quotations.'));
        },
      });
  }

  private allRows: QuotationListItem[] = [];

  private applyClientFilter(): void {
    const q = this.filterForm.controls.search.value.trim().toLowerCase();
    let list = [...this.allRows];
    if (q) {
      list = list.filter(
        (r) =>
          r.quotationNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          r.emailAddress.toLowerCase().includes(q),
      );
    }
    this.rows.set(list);
  }

  protected createQuotation(): void {
    void this.router.navigate(['/quotations/new']);
  }

  protected viewRow(id: number): void {
    void this.router.navigate(['/quotations', id]);
  }

  protected editRow(id: number): void {
    void this.router.navigate(['/quotations', id, 'edit']);
  }

  protected duplicateRow(id: number): void {
    this.quotationsService
      .duplicate(id)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.toast.success('Quotation duplicated successfully.');
          this.refresh();
          if (saved.id) void this.router.navigate(['/quotations', saved.id, 'edit']);
        },
        error: (err) => this.toast.error(quotationHttpErrorMessage(err, 'Duplicate failed.')),
      });
  }

  protected deleteRow(id: number, number: string): void {
    if (!confirm(`Delete quotation ${number || id}?`)) return;
    this.quotationsService
      .delete(id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toast.success('Quotation deleted successfully.');
          this.refresh();
        },
        error: (err) => this.toast.error(quotationHttpErrorMessage(err, 'Delete failed.')),
      });
  }

  protected statusClass(status: string): string {
    const map: Record<string, string> = {
      Draft: 'draft',
      Sent: 'sent',
      Approved: 'approved',
      Rejected: 'rejected',
      Expired: 'expired',
    };
    return map[status as QuotationStatus] ?? 'draft';
  }
}

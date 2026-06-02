import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import type { QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import { QuotationsService, quotationHttpErrorMessage } from '../../core/services/quotations.service';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-quotation-view',
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './quotation-view.component.html',
  styleUrl: './quotation-view.component.scss',
})
export class QuotationViewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly quotationsService = inject(QuotationsService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly quotation = signal<QuotationUpsertDto | null>(null);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id) || id <= 0) {
        void this.router.navigate(['/quotations']);
        return;
      }
      this.load(id);
    });
  }

  protected edit(): void {
    const id = this.quotation()?.id;
    if (id) void this.router.navigate(['/quotations', id, 'edit']);
  }

  protected duplicate(): void {
    const id = this.quotation()?.id;
    if (!id) return;
    this.quotationsService
      .duplicate(id)
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.toast.success('Quotation duplicated successfully.');
          if (saved.id) void this.router.navigate(['/quotations', saved.id, 'edit']);
        },
        error: (err) => this.toast.error(quotationHttpErrorMessage(err)),
      });
  }

  protected deleteDoc(): void {
    const q = this.quotation();
    if (!q?.id) return;
    if (!confirm(`Delete quotation ${q.quotationNumber}?`)) return;
    this.quotationsService
      .delete(q.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toast.success('Quotation deleted successfully.');
          void this.router.navigate(['/quotations']);
        },
        error: (err) => this.toast.error(quotationHttpErrorMessage(err)),
      });
  }

  protected grandTotal(): number {
    const q = this.quotation();
    if (q?.grandTotal != null && q.grandTotal > 0) return q.grandTotal;
    return (q?.lineItems ?? []).reduce((s, l) => s + (l.lineTotal || l.amount || 0), 0);
  }

  protected taxTotal(): number {
    const q = this.quotation();
    if (q?.taxTotal != null) return q.taxTotal;
    return (q?.lineItems ?? []).reduce((s, l) => s + (l.taxAmount || 0), 0);
  }

  protected totalQuantity(): number {
    const q = this.quotation();
    if (q?.totalQuantity != null) return q.totalQuantity;
    return (q?.lineItems ?? []).reduce((s, l) => s + (l.quantity || 0), 0);
  }

  protected totalWeight(): number {
    const q = this.quotation();
    if (q?.totalWeight != null) return q.totalWeight;
    return 0;
  }

  protected statusClass(status: string): string {
    const map: Record<string, string> = {
      Draft: 'draft',
      Sent: 'sent',
      Approved: 'approved',
      Rejected: 'rejected',
      Expired: 'expired',
    };
    return map[status] ?? 'draft';
  }

  private load(id: number): void {
    this.loading.set(true);
    this.quotationsService
      .getById(id)
      .pipe(take(1))
      .subscribe({
        next: (q) => {
          this.loading.set(false);
          if (!q) {
            this.toast.error('Quotation not found.');
            void this.router.navigate(['/quotations']);
            return;
          }
          this.quotation.set(q);
        },
        error: (err) => {
          this.loading.set(false);
          this.toast.error(quotationHttpErrorMessage(err));
          void this.router.navigate(['/quotations']);
        },
      });
  }
}

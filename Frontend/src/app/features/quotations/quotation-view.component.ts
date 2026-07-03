import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import type { QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import {
  hasAdditionalCharges,
  listAdditionalChargeLines,
  type QuotationAdditionalChargesInput,
} from '../../core/services/quotations/quotation-additional-charges.util';
import {
  collectDynamicColumnsFromSnapshots,
  parseItemSnapshot,
  snapshotFieldValue,
  type SnapshotColumnDef,
} from '../../core/services/quotations/quotation-item-snapshot.util';
import { PermissionService } from '../../core/services/permission.service';
import { QuotationsService, quotationHttpErrorMessage } from '../../core/services/quotations.service';
import { ToastService } from '../../core/toast/toast.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { IntlTelDisplayPipe } from '../../shared/pipes/intl-tel-display.pipe';
import {
  isTechnicalProposalTemplate,
  quotationTemplateLabel,
} from '../../core/services/quotations/quotation-template.constants';

@Component({
  selector: 'app-quotation-view',
  imports: [RouterLink, DatePipe, DecimalPipe, IntlTelDisplayPipe],
  templateUrl: './quotation-view.component.html',
  styleUrl: './quotation-view.component.scss',
})
export class QuotationViewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly quotationsService = inject(QuotationsService);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);
  private readonly quotationPdf = inject(QuotationPdfService);

  protected readonly canDeleteQuotation = computed(() => this.permissions.has('quotations.delete'));
  protected readonly loading = signal(true);
  protected readonly pdfGenerating = signal(false);
  protected readonly quotation = signal<QuotationUpsertDto | null>(null);

  protected readonly templateLabel = computed(() =>
    quotationTemplateLabel(this.quotation()?.quotationTemplate),
  );

  protected readonly isTechnicalProposal = computed(() =>
    isTechnicalProposalTemplate(this.quotation()?.quotationTemplate),
  );

  protected readonly dynamicColumns = computed((): SnapshotColumnDef[] => {
    const q = this.quotation();
    return collectDynamicColumnsFromSnapshots(q?.lineItems ?? []);
  });

  protected readonly usesHeaderGst = computed(() => (this.quotation()?.gstPercent ?? 0) > 0);

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

  protected async downloadPdf(): Promise<void> {
    const q = this.quotation();
    if (!q || this.pdfGenerating()) return;
    this.pdfGenerating.set(true);
    try {
      await this.quotationPdf.download(q);
      this.toast.success('PDF downloaded.');
    } catch {
      this.toast.error('Could not generate PDF. Please try again.');
    } finally {
      this.pdfGenerating.set(false);
    }
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
    if (!this.canDeleteQuotation()) {
      this.toast.error('You do not have permission to perform this action.');
      return;
    }
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

  protected dynamicCell(lineSnapshotJson: string | undefined, columnKey: string): string {
    const snapshot = parseItemSnapshot(lineSnapshotJson);
    return snapshotFieldValue(snapshot, columnKey) || '—';
  }

  protected subtotal(): number {
    const q = this.quotation();
    if (q?.subtotal != null) return q.subtotal;
    return (q?.lineItems ?? []).reduce((s, l) => s + (l.amount || 0), 0);
  }

  protected headerGstPercent(): number {
    return this.quotation()?.gstPercent ?? 0;
  }

  protected additionalChargeLines(): { label: string; amount: number }[] {
    const q = this.quotation();
    if (!q) return [];
    return listAdditionalChargeLines(this.additionalChargesInput(q));
  }

  protected showAdditionalCharges(): boolean {
    const q = this.quotation();
    if (!q) return false;
    return hasAdditionalCharges(this.additionalChargesInput(q));
  }

  private additionalChargesInput(q: QuotationUpsertDto): QuotationAdditionalChargesInput {
    return {
      transportationCharges: q.transportationCharges ?? 0,
      loadingCharges: q.loadingCharges ?? 0,
      serviceCharges: q.serviceCharges ?? 0,
      customCharges: (q.customCharges ?? []).map((c, i) => ({
        sortIndex: c.sortIndex ?? i,
        chargeName: c.chargeName,
        amount: c.amount,
      })),
    };
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

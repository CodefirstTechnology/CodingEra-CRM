import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { combineLatest, forkJoin, take } from 'rxjs';
import { DealMasterSelectService } from '../../core/services/deals/deal-master-select.service';
import {
  masterOptionFormValue,
} from '../../core/services/organizations/organization-master-select.util';
import type { QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import { QUOTATION_STATUSES } from '../../core/services/quotations/quotation-api.models';
import { QuotationDealPrefillService } from '../../core/services/quotations/quotation-deal-prefill.service';
import {
  aggregateQuotationLines,
  recalcLineGroupValues,
} from '../../core/services/quotations/quotation-line-calc.util';
import { QuotationsService, quotationHttpErrorMessage } from '../../core/services/quotations.service';
import { ToastService } from '../../core/toast/toast.service';
import {
  consumeDealQuotationPrefill,
  readDealQuotationPrefillFromNavigation,
  revenueStringToNumber,
} from '../../shared/utils/deal-quotation-prefill.util';
import {
  GSTIN_ERROR_KEY,
  GSTIN_ERROR_MESSAGE,
  gstControlInvalid,
  normalizeGstin,
  syncGstinInputFromEvent,
} from '../../shared/utils/gstin.util';
import { gstFormValidators } from '../../shared/validators/crm-validators';
import { QuotationItemGridComponent } from './quotation-item-grid/quotation-item-grid.component';
import { createQuotationLineGroup, type QuotationLineFormValue } from './quotation-line-form.util';
import { splitFullName } from '../leads/lead-full-name.util';
import { formatQuotationNumber } from '../../core/services/quotations/quotation-next-number.util';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDealIdFromQuery(qpm: ParamMap): number | null {
  const raw = qpm.get('dealId');
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

@Component({
  selector: 'app-quotation-form',
  imports: [ReactiveFormsModule, RouterLink, QuotationItemGridComponent],
  templateUrl: './quotation-form.component.html',
  styleUrl: './quotation-form.component.scss',
})
export class QuotationFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly quotationsService = inject(QuotationsService);
  private readonly prefillService = inject(QuotationDealPrefillService);
  protected readonly dealMaster = inject(DealMasterSelectService);
  private readonly toast = inject(ToastService);

  protected readonly masterOptionFormValue = masterOptionFormValue;
  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly editId = signal<number | null>(null);
  protected readonly statusOptions = QUOTATION_STATUSES;
  protected readonly pageTitle = computed(() =>
    this.editId() ? 'Edit Quotation' : 'New Quotation',
  );

  protected readonly form = this.fb.nonNullable.group({
    dealId: [null as number | null],
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    gender: [''],
    mobileNumber: ['', Validators.maxLength(64)],
    emailAddress: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    companyName: ['', [Validators.required, Validators.maxLength(512)]],
    employees: [''],
    annualRevenue: [''],
    website: ['', Validators.maxLength(512)],
    gst: ['', gstFormValidators()],
    territory: [''],
    industry: ['', Validators.required],
    contactPerson: ['', Validators.maxLength(256)],
    officeAddress: [''],
    siteAddress: [''],
    referenceNumber: [''],
    referenceDate: [''],
    companyCode: ['', Validators.maxLength(32)],
    documentTypeCode: ['QTN'],
    fiscalYearLabel: ['', Validators.maxLength(16)],
    sequenceNumber: [0],
    quotationNumber: ['', Validators.maxLength(64)],
    quotationDate: [todayIsoDate(), Validators.required],
    status: ['Draft', Validators.required],
    remarks: [''],
    lineItems: this.fb.array([this.createLineGroup()]),
  });

  protected readonly grandTotal = computed(() => {
    let sum = 0;
    for (const ctrl of this.lineItems.controls) {
      const g = ctrl as FormGroup;
      const raw = g.getRawValue();
      sum += recalcLineGroupValues(raw).lineTotal;
    }
    return sum;
  });

  constructor() {
    this.dealMaster.ensureStatusesLoaded().pipe(take(1)).subscribe();

    combineLatest([this.route.paramMap, this.route.url, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, segments, queryParams]) => {
        const paths = segments.map((s) => s.path);
        if (paths.includes('new')) {
          this.editId.set(null);
          this.initNew(queryParams);
          return;
        }
        if (paths.includes('edit')) {
          const idParam = params.get('id');
          const id = idParam ? Number(idParam) : NaN;
          if (Number.isFinite(id) && id > 0) {
            this.editId.set(id);
            this.loadQuotation(id);
            return;
          }
        }
        this.editId.set(null);
        this.initNew(queryParams);
      });
  }

  protected get lineItems(): FormArray {
    return this.form.controls.lineItems;
  }

  protected addLine(): void {
    this.lineItems.push(createQuotationLineGroup(this.fb));
  }

  protected removeLine(index: number): void {
    if (this.lineItems.length <= 1) return;
    this.lineItems.removeAt(index);
  }

  protected lineGroupAt(index: number): FormGroup {
    return this.lineItems.at(index) as FormGroup;
  }

  protected readonly gstinErrorMessage = GSTIN_ERROR_MESSAGE;
  protected readonly gstinErrorKey = GSTIN_ERROR_KEY;

  protected fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected gstFieldInvalid(): boolean {
    return gstControlInvalid(this.form.controls.gst);
  }

  protected onGstinInput(ev: Event): void {
    syncGstinInputFromEvent(ev, this.form.controls.gst);
  }

  protected lineFieldInvalid(index: number, name: string): boolean {
    const g = this.lineGroupAt(index);
    const c = g.controls[name];
    return c != null && c.invalid && (c.touched || c.dirty);
  }

  protected refreshQuotationNumber(): void {
    const cc = this.form.controls.companyCode.value.trim();
    this.quotationsService
      .getNextNumber(cc || undefined)
      .pipe(take(1))
      .subscribe({
        next: (n) => {
          this.form.patchValue({
            companyCode: n.companyCode || 'BCEPL',
            documentTypeCode: n.documentTypeCode,
            fiscalYearLabel: n.fiscalYearLabel,
            sequenceNumber: n.sequenceNumber,
            quotationDate: n.quotationDate?.slice(0, 10) || todayIsoDate(),
          });
          this.syncQuotationNumberDisplay();
        },
        error: (err) =>
          this.toast.error(quotationHttpErrorMessage(err, 'Could not generate quotation number.')),
      });
  }

  protected saveDraft(): void {
    this.submitQuotation('Draft');
  }

  protected saveQuotation(): void {
    this.submitQuotation(this.form.controls.status.value);
  }

  private submitQuotation(forceStatus?: string): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.toast.error('Please fill all required fields.');
      return;
    }

    const body = this.buildDto(forceStatus);
    const id = this.editId();
    this.saving.set(true);

    const req$ =
      id != null
        ? this.quotationsService.update(id, body)
        : this.quotationsService.create(body);

    req$.pipe(take(1)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(
          id != null ? 'Quotation updated successfully.' : 'Quotation saved successfully.',
        );
        const newId = saved.id ?? id;
        if (newId) void this.router.navigate(['/quotations', newId]);
        else void this.router.navigate(['/quotations']);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(quotationHttpErrorMessage(err, 'Save failed.'));
      },
    });
  }

  private buildDto(statusOverride?: string): QuotationUpsertDto {
    const v = this.form.getRawValue();
    const { firstName, lastName } = splitFullName(v.fullName);
    const customerName = v.fullName.trim() || v.companyName.trim();
    const contactPerson = v.contactPerson.trim() || customerName;

    const lineRows = (v.lineItems as QuotationLineFormValue[]).map((l, i) => {
      const calc = recalcLineGroupValues(l);
      return {
        lineIndex: i,
        itemCode: l.itemCode.trim(),
        itemName: l.itemName.trim(),
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        uom: l.uom.trim(),
        weight: Number(l.weight) || 0,
        unitWeight: Number(l.unitWeight) || 0,
        rate: Number(l.rate) || 0,
        discountPercent: Number(l.discountPercent) || 0,
        gstPercent: Number(l.gstPercent) || 0,
        amount: calc.amount,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
      };
    });
    const totals = aggregateQuotationLines(
      lineRows.map((l) => ({ quantity: l.quantity, amounts: recalcLineGroupValues(l) })),
    );

    return {
      id: this.editId() ?? undefined,
      dealId: v.dealId,
      salutation: '',
      firstName,
      lastName,
      gender: v.gender.trim(),
      customerName,
      companyName: v.companyName.trim(),
      employees: v.employees.trim(),
      annualRevenue: revenueStringToNumber(v.annualRevenue),
      website: v.website.trim(),
      gst: normalizeGstin(v.gst),
      territory: v.territory.trim(),
      industry: v.industry.trim(),
      contactPerson,
      mobileNumber: v.mobileNumber.trim(),
      emailAddress: v.emailAddress.trim(),
      officeAddress: v.officeAddress.trim(),
      siteAddress: v.siteAddress.trim(),
      referenceNumber: v.referenceNumber.trim(),
      referenceDate: v.referenceDate || null,
      companyCode: v.companyCode.trim(),
      documentTypeCode: v.documentTypeCode.trim() || 'QTN',
      fiscalYearLabel: v.fiscalYearLabel.trim(),
      sequenceNumber: this.editId() != null ? v.sequenceNumber : 0,
      quotationNumber: this.editId() != null ? v.quotationNumber.trim() : '',
      quotationDate: v.quotationDate || null,
      status: statusOverride ?? v.status,
      remarks: v.remarks.trim(),
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      totalQuantity: totals.totalQuantity,
      totalWeight: totals.totalWeight,
      lineItems: lineRows,
    };
  }

  private createLineGroup() {
    return createQuotationLineGroup(this.fb);
  }

  private initNew(queryParams: ParamMap): void {
    this.loading.set(true);
    const cached = consumeDealQuotationPrefill() ?? readDealQuotationPrefillFromNavigation();
    const dealIdFromQuery = parseDealIdFromQuery(queryParams);

    forkJoin({
      settings: this.quotationsService.getSettings(),
      next: this.quotationsService.getNextNumber(),
      dealPatch: this.prefillService.resolveFormPatch(cached, dealIdFromQuery),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ settings, next, dealPatch }) => {
          const base: Record<string, unknown> = {
            dealId: dealIdFromQuery,
            fullName: '',
            gender: '',
            mobileNumber: '',
            emailAddress: '',
            companyName: '',
            employees: '',
            annualRevenue: '',
            website: '',
            gst: '',
            territory: '',
            industry: '',
            contactPerson: '',
            officeAddress: '',
            siteAddress: '',
            referenceNumber: '',
            referenceDate: '',
            companyCode: next.companyCode || settings.companyCode || 'BCEPL',
            documentTypeCode: next.documentTypeCode || settings.documentTypeCode || 'QTN',
            fiscalYearLabel: next.fiscalYearLabel,
            sequenceNumber: next.sequenceNumber,
            quotationDate: next.quotationDate?.slice(0, 10) || todayIsoDate(),
            status: 'Draft',
            remarks: '',
          };
          this.applyNewFormPatch({ ...base, ...(dealPatch ?? {}) });
          this.syncQuotationNumberDisplay();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error(
            'Could not load quotation defaults. Restart the CRM API (Backend_CRM) and try again.',
          );
        },
      });
  }

  private applyNewFormPatch(patch: Record<string, unknown>): void {
    const firstName = String(patch['firstName'] ?? '');
    const lastName = String(patch['lastName'] ?? '');
    const fullName =
      String(patch['fullName'] ?? '').trim() ||
      [firstName, lastName].filter(Boolean).join(' ').trim();

    this.form.patchValue({
      dealId: (patch['dealId'] as number | null) ?? null,
      fullName,
      gender: String(patch['gender'] ?? ''),
      mobileNumber: String(patch['mobileNumber'] ?? ''),
      emailAddress: String(patch['emailAddress'] ?? ''),
      companyName: String(patch['companyName'] ?? ''),
      employees: String(patch['employees'] ?? ''),
      annualRevenue: String(patch['annualRevenue'] ?? ''),
      website: String(patch['website'] ?? ''),
      gst: String(patch['gst'] ?? ''),
      territory: String(patch['territory'] ?? ''),
      industry: String(patch['industry'] ?? ''),
      contactPerson: String(patch['contactPerson'] ?? ''),
      officeAddress: String(patch['officeAddress'] ?? ''),
      siteAddress: String(patch['siteAddress'] ?? ''),
      referenceNumber: String(patch['referenceNumber'] ?? ''),
      referenceDate: String(patch['referenceDate'] ?? ''),
      companyCode: String(patch['companyCode'] ?? 'BCEPL'),
      documentTypeCode: String(patch['documentTypeCode'] ?? 'QTN'),
      fiscalYearLabel: String(patch['fiscalYearLabel'] ?? ''),
      sequenceNumber: Number(patch['sequenceNumber']) || 0,
      quotationDate: String(patch['quotationDate'] ?? todayIsoDate()),
      status: String(patch['status'] ?? 'Draft'),
      remarks: String(patch['remarks'] ?? ''),
    });
    this.lineItems.clear();
    this.lineItems.push(this.createLineGroup());
    this.syncQuotationNumberDisplay();
  }

  /** Display e.g. BCEPL/QTN/2025-26/601 from hidden numbering parts. */
  private syncQuotationNumberDisplay(): void {
    const cc = this.form.controls.companyCode.value.trim() || 'BCEPL';
    const doc = this.form.controls.documentTypeCode.value.trim() || 'QTN';
    const fy = this.form.controls.fiscalYearLabel.value.trim();
    const seq = this.form.controls.sequenceNumber.value;
    if (!fy || seq <= 0) return;

    if (!this.form.controls.companyCode.value.trim()) {
      this.form.controls.companyCode.setValue(cc, { emitEvent: false });
    }

    this.form.controls.quotationNumber.setValue(formatQuotationNumber(cc, doc, fy, seq), {
      emitEvent: false,
    });
  }

  private loadQuotation(id: number): void {
    this.loading.set(true);
    this.quotationsService
      .getById(id)
      .pipe(take(1))
      .subscribe({
        next: (q) => {
          if (!q) {
            this.loading.set(false);
            this.toast.error('Quotation not found.');
            void this.router.navigate(['/quotations']);
            return;
          }
          if (q.dealClosed) {
            this.loading.set(false);
            this.toast.error('Quotations linked to closed deals cannot be modified.');
            void this.router.navigate(['/quotations', id]);
            return;
          }
          this.patchFromDto(q);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.toast.error(quotationHttpErrorMessage(err));
          void this.router.navigate(['/quotations']);
        },
      });
  }

  private patchFromDto(q: QuotationUpsertDto): void {
    const annualRevenue =
      q.annualRevenue != null && Number.isFinite(q.annualRevenue) && q.annualRevenue > 0
        ? q.annualRevenue.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : '';

    this.form.patchValue({
      dealId: q.dealId ?? null,
      fullName: [q.firstName, q.lastName].filter(Boolean).join(' ').trim() || q.customerName?.trim() || '',
      gender: q.gender ?? '',
      mobileNumber: q.mobileNumber,
      emailAddress: q.emailAddress,
      companyName: q.companyName,
      employees: q.employees ?? '',
      annualRevenue,
      website: q.website ?? '',
      gst: normalizeGstin(q.gst),
      territory: q.territory ?? '',
      industry: q.industry ?? '',
      contactPerson: q.contactPerson,
      officeAddress: q.officeAddress,
      siteAddress: q.siteAddress,
      referenceNumber: q.referenceNumber,
      referenceDate: q.referenceDate?.slice(0, 10) ?? '',
      companyCode: q.companyCode,
      documentTypeCode: q.documentTypeCode,
      fiscalYearLabel: q.fiscalYearLabel,
      sequenceNumber: q.sequenceNumber,
      quotationNumber: q.quotationNumber,
      quotationDate: q.quotationDate?.slice(0, 10) ?? todayIsoDate(),
      status: q.status,
      remarks: q.remarks,
    });
    this.lineItems.clear();
    const lines = q.lineItems?.length
      ? q.lineItems
      : [
          {
            itemName: '',
            description: '',
            quantity: 1,
            rate: 0,
            amount: 0,
            lineIndex: 0,
            itemCode: '',
            uom: 'Nos',
            weight: 0,
            unitWeight: 0,
            discountPercent: 0,
            gstPercent: 0,
            taxAmount: 0,
            lineTotal: 0,
          },
        ];
    for (const l of lines) {
      const g = this.createLineGroup();
      g.patchValue({
        itemCode: l.itemCode,
        itemName: l.itemName ?? l.itemCode,
        description: l.description,
        quantity: l.quantity,
        uom: l.uom || 'Nos',
        weight: l.weight ?? 0,
        unitWeight: l.unitWeight ?? 0,
        rate: l.rate,
        discountPercent: l.discountPercent ?? 0,
        gstPercent: l.gstPercent ?? 0,
        amount: l.amount,
        taxAmount: l.taxAmount ?? 0,
        lineTotal: l.lineTotal ?? l.amount,
      });
      this.lineItems.push(g);
    }
    this.syncQuotationNumberDisplay();
  }
}

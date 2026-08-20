import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { ContactsService } from '../../core/services/contacts.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { DealsService } from '../../core/services/deals.service';
import type { ContactRow } from './contacts.component';
import type { DealPipelineStatus, DealRow } from '../deals/deals.component';
import { dealStatusCssKind } from '../../core/services/deals/deal-status.constants';
import { getCrmIntlTelInitOptions, crmIntlTelInputProps } from '../../shared/config/crm-intl-tel.config';
import { intlTelFieldInvalid, intlTelMobileErrorMessage } from '../../shared/utils/intl-tel.util';
import { TextFormatter } from '../../shared/utils/text-normalizer';
import { IntlTelDisplayPipe } from '../../shared/pipes/intl-tel-display.pipe';
import { IntlTelInputComponent } from 'intl-tel-input/angularWithUtils';

@Component({
  selector: 'app-contact-detail',
  imports: [RouterLink, ReactiveFormsModule, IntlTelInputComponent, IntlTelDisplayPipe],
  templateUrl: './contact-detail.component.html',
  styleUrl: './contact-detail.component.scss',
})
export class ContactDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly contactsService = inject(ContactsService);
  private readonly toast = inject(ToastService);
  private readonly dealsService = inject(DealsService);
  private readonly createRowBus = inject(CreateRowBusService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly contact = signal<ContactRow | null>(null);
  protected readonly relatedDeals = signal<DealRow[]>([]);
  protected readonly saving = signal(false);
  protected readonly resolved = signal(false);
  protected readonly detailsOpen = signal(true);

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  protected readonly detailForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.maxLength(80)]],
    lastName: ['', Validators.maxLength(120)],
    email: ['', [Validators.email, Validators.maxLength(160)]],
    mobile: ['', Validators.maxLength(40)],
    gender: [''],
    companyName: ['', Validators.maxLength(200)],
    designation: ['', Validators.maxLength(120)],
    address: [''],
  });

  protected readonly intlTelInitOptions = getCrmIntlTelInitOptions();
  protected readonly intlTelDetailInputProps = crmIntlTelInputProps();
  protected intlTelMobileError = intlTelMobileErrorMessage;
  protected intlTelFieldInvalid = intlTelFieldInvalid;

  protected readonly dealCount = computed(() => this.relatedDeals().length);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(id)) {
        this.numericId.set(null);
        this.contact.set(null);
        this.relatedDeals.set([]);
        this.resolved.set(true);
        return;
      }
      this.numericId.set(id);
      this.resolved.set(false);
      this.loadContact(id);
    });

    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind === 'deal') this.refreshRelatedDeals();
    });
  }

  private loadContact(id: number): void {
    this.contactsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        this.contact.set(row);
        this.resolved.set(true);
        if (row) {
          this.patchDetailForm(row);
          this.refreshRelatedDeals();
        } else {
          this.relatedDeals.set([]);
        }
      });
  }

  private patchDetailForm(row: ContactRow): void {
    this.detailForm.patchValue(
      {
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? '',
        email: row.email,
        mobile: row.phone === '—' ? '' : row.phone,
        gender: row.gender ?? '',
        companyName: row.organization ?? '',
        designation: row.designation ?? '',
        address: row.address ?? '',
      },
      { emitEvent: false },
    );
    this.detailForm.markAsPristine();
  }

  private refreshRelatedDeals(): void {
    const cid = this.contact()?.id?.trim();
    if (!cid) {
      this.relatedDeals.set([]);
      return;
    }
    this.dealsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const scoped = rows.filter((d) => (d.relatedContactId ?? '').trim() === cid);
        this.relatedDeals.set(scoped);
      });
  }

  protected contactHeadline(): string {
    const row = this.contact();
    const v = this.detailForm.getRawValue();
    const fromForm = [v.firstName.trim(), v.lastName.trim()].filter(Boolean).join(' ');
    if (fromForm) return fromForm;
    if (row?.firstName?.trim() || row?.lastName?.trim()) {
      return [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(' ');
    }
    const local = row?.email?.split('@')[0]?.trim();
    return local || row?.email || 'Contact';
  }

  protected avatarLetters(): string {
    const name = this.contactHeadline();
    const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length <= 1) return name.slice(0, 2).toUpperCase() || '?';
    return cleaned.slice(0, 11).toUpperCase();
  }

  protected sidebarPlaceholder(label: string): string {
    return `Add ${label}...`;
  }

  protected toggleDetails(): void {
    this.detailsOpen.update((o) => !o);
  }

  protected discardDetailEdits(): void {
    const row = this.contact();
    if (row) this.patchDetailForm(row);
  }

  protected saveDetails(): void {
    const idn = this.numericId();
    const row = this.contact();
    if (idn == null || !row) return;
    TextFormatter.form(this.detailForm);
    this.detailForm.markAllAsTouched();
    if (this.detailForm.invalid) return;

    const v = this.detailForm.getRawValue();
    const emailLower = v.email.trim().toLowerCase();

    this.contactsService
      .getAll()
      .pipe(take(1))
      .subscribe((all) => {
        const dup = emailLower ? all.some((c) => c.email.toLowerCase() === emailLower && c.id !== row.id) : false;
        if (dup) {
          const ec = this.detailForm.get('email');
          ec?.setErrors({ ...(ec.errors ?? {}), duplicate: true });
          ec?.markAsTouched();
          return;
        }

        this.clearEmailDupError();
        this.saving.set(true);
        const payload: Partial<Omit<ContactRow, 'id'>> = {
          email: v.email.trim(),
          phone: v.mobile.trim() || '—',
          organization: v.companyName.trim(),
          lastModified: 'Just now',
          firstName: v.firstName.trim() || undefined,
          lastName: v.lastName.trim() || undefined,
          gender: v.gender.trim() || undefined,
          designation: v.designation.trim() || undefined,
          address: v.address.trim() || undefined,
        };

        this.contactsService
          .update(idn, payload)
          .pipe(take(1))
          .subscribe({
            next: (updated) => {
              this.saving.set(false);
              if (updated) {
                this.contact.set(updated);
                this.patchDetailForm(updated);
                this.toast.success('Contact saved.');
              }
            },
            error: (e: unknown) => {
              this.saving.set(false);
              this.toast.error(leadsHttpErrorMessage(e));
            },
          });
      });
  }

  protected clearEmailDupError(): void {
    const c = this.detailForm.get('email');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected dealStatusDotClass(status: DealPipelineStatus): string {
    const kind = dealStatusCssKind(status);
    return kind === 'demo' ? 'contact-detail__status-dot contact-detail__status-dot--demo' : 'contact-detail__status-dot';
  }

  protected dealStatusClass(status: DealPipelineStatus): string {
    const kind = dealStatusCssKind(status);
    switch (kind) {
      case 'won':
        return 'contact-detail__pill contact-detail__pill--ok';
      case 'lost':
        return 'contact-detail__pill contact-detail__pill--bad';
      case 'demo':
        return 'contact-detail__pill contact-detail__pill--demo';
      case 'accent':
        return 'contact-detail__pill contact-detail__pill--accent';
      default:
        return 'contact-detail__pill contact-detail__pill--muted';
    }
  }

  protected orgDealInitial(org: string): string {
    const t = org.trim();
    return t ? t.charAt(0).toUpperCase() : '?';
  }

  protected formatDealAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '₹0.00';
    return `₹${value.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  protected dealOwnerInitials(d: DealRow): string {
    const i = d.assignedInitials?.trim();
    if (i) return i.charAt(0).toUpperCase();
    const n = d.assignedTo?.trim();
    return n ? n.charAt(0).toUpperCase() : '?';
  }
}

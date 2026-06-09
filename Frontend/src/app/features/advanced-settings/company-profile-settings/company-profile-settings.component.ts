import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { canManageSettings } from '../../../core/auth/permission.util';
import { AuthService } from '../../../core/auth/auth.service';
import type { CompanyProfile, CompanyProfileTerm } from '../../../core/services/company-profile/company-profile-api.models';
import { CompanyProfileHttpService } from '../../../core/services/company-profile/company-profile-http.service';
import { ToastService } from '../../../core/toast/toast.service';
import { getCrmIntlTelInitOptions, crmIntlTelInputProps } from '../../../shared/config/crm-intl-tel.config';
import { intlTelFieldInvalid, intlTelMobileErrorMessage } from '../../../shared/utils/intl-tel.util';
import { IntlTelInputComponent } from 'intl-tel-input/angularWithUtils';
import { optionalPhoneValidator } from '../../../shared/validators/crm-validators';

const MAX_LOGO_BYTES = 2_100_000;

@Component({
  selector: 'app-company-profile-settings',
  imports: [ReactiveFormsModule, IntlTelInputComponent],
  templateUrl: './company-profile-settings.component.html',
  styleUrl: './company-profile-settings.component.scss',
})
export class CompanyProfileSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CompanyProfileHttpService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly logoPreviewUrl = signal<string | null>(null);
  protected readonly logoRemoved = signal(false);
  protected readonly canEdit = signal(false);

  private pendingLogoBase64: string | null = null;
  private pendingLogoContentType = '';

  protected readonly form = this.fb.nonNullable.group({
    brandName: ['', [Validators.maxLength(128)]],
    companyName: ['', [Validators.required, Validators.maxLength(512)]],
    tagline: ['', [Validators.maxLength(512)]],
    businessLine: [''],
    gstin: ['', [Validators.maxLength(32)]],
    cinNumber: ['', [Validators.maxLength(64)]],
    address: [''],
    contactNumber: ['', [Validators.maxLength(64), optionalPhoneValidator()]],
    email: ['', [Validators.maxLength(512)]],
    website: ['', [Validators.maxLength(256)]],
    bankName: ['', [Validators.maxLength(256)]],
    accountNumber: ['', [Validators.maxLength(64)]],
    ifscCode: ['', [Validators.maxLength(32)]],
    branchName: ['', [Validators.maxLength(256)]],
    signatoryName: ['', [Validators.maxLength(256)]],
    signatoryMobile: [''],
    introText: [''],
    transportationLabel: ['', [Validators.maxLength(128)]],
    jurisdiction: ['', [Validators.maxLength(256)]],
    defaultGstPercent: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
    terms: this.fb.array([] as ReturnType<typeof this.createTermGroup>[]),
  });

  protected readonly intlTelInitOptions = getCrmIntlTelInitOptions();
  protected readonly intlTelMobileInputProps = crmIntlTelInputProps('');
  protected intlTelMobileError = intlTelMobileErrorMessage;
  protected intlTelFieldInvalid = intlTelFieldInvalid;

  ngOnInit(): void {
    this.canEdit.set(canManageSettings(this.auth.user()));
    this.loadProfile();
  }

  protected termsArray(): FormArray {
    return this.form.get('terms') as FormArray;
  }

  protected addTerm(prefill?: CompanyProfileTerm): void {
    this.termsArray().push(this.createTermGroup(prefill));
  }

  protected removeTerm(index: number): void {
    this.termsArray().removeAt(index);
  }

  protected onLogoSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toast.error('Please choose a PNG or JPEG image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.toast.error('Logo must be smaller than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma < 0) return;
      this.pendingLogoBase64 = result.slice(comma + 1);
      this.pendingLogoContentType = file.type;
      this.logoRemoved.set(false);
      this.logoPreviewUrl.set(result);
    };
    reader.readAsDataURL(file);
  }

  protected clearLogo(): void {
    this.pendingLogoBase64 = null;
    this.pendingLogoContentType = '';
    this.logoPreviewUrl.set(null);
    this.logoRemoved.set(true);
  }

  protected submit(): void {
    if (!this.canEdit()) {
      this.toast.error('You do not have permission to update company profile.');
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const terms = (v.terms ?? [])
      .map((t) => ({ title: t.title.trim(), body: t.body.trim() }))
      .filter((t) => t.title || t.body);

    const payload = {
      brandName: v.brandName.trim(),
      companyName: v.companyName.trim(),
      tagline: v.tagline.trim(),
      businessLine: v.businessLine.trim(),
      logoContentType: this.pendingLogoContentType,
      logoBase64: this.pendingLogoBase64,
      removeLogo: this.logoRemoved(),
      gstin: v.gstin.trim(),
      cinNumber: v.cinNumber.trim(),
      address: v.address.trim(),
      contactNumber: v.contactNumber.trim(),
      email: v.email.trim(),
      website: v.website.trim(),
      bankName: v.bankName.trim(),
      accountNumber: v.accountNumber.trim(),
      ifscCode: v.ifscCode.trim(),
      branchName: v.branchName.trim(),
      signatoryName: v.signatoryName.trim(),
      signatoryMobile: v.signatoryMobile.trim(),
      terms,
      introText: v.introText.trim(),
      transportationLabel: v.transportationLabel.trim(),
      jurisdiction: v.jurisdiction.trim(),
      defaultGstPercent: Number(v.defaultGstPercent) || 18,
    };

    this.saving.set(true);
    this.api.update(payload).subscribe({
      next: (row) => {
        this.saving.set(false);
        this.pendingLogoBase64 = null;
        this.pendingLogoContentType = '';
        this.logoRemoved.set(false);
        this.applyProfile(row);
        this.toast.success('Company profile saved.');
      },
      error: (err) => {
        this.saving.set(false);
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? 'Could not save company profile.';
        this.toast.error(msg);
      },
    });
  }

  protected fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  private createTermGroup(prefill?: CompanyProfileTerm) {
    return this.fb.nonNullable.group({
      title: [prefill?.title ?? '', [Validators.maxLength(128)]],
      body: [prefill?.body ?? ''],
    });
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.get().subscribe({
      next: (row) => {
        this.loading.set(false);
        this.applyProfile(row);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load company profile.');
      },
    });
  }

  private applyProfile(row: CompanyProfile): void {
    while (this.termsArray().length) {
      this.termsArray().removeAt(0);
    }
    const terms = row.terms?.length ? row.terms : [{ title: '', body: '' }];
    terms.forEach((t) => this.addTerm(t));

    this.form.patchValue({
      brandName: row.brandName,
      companyName: row.companyName,
      tagline: row.tagline,
      businessLine: row.businessLine,
      gstin: row.gstin,
      cinNumber: row.cinNumber,
      address: row.address,
      contactNumber: row.contactNumber,
      email: row.email,
      website: row.website,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      ifscCode: row.ifscCode,
      branchName: row.branchName,
      signatoryName: row.signatoryName,
      signatoryMobile: row.signatoryMobile,
      introText: row.introText,
      transportationLabel: row.transportationLabel,
      jurisdiction: row.jurisdiction,
      defaultGstPercent: row.defaultGstPercent || 18,
    });

    if (row.logoBase64 && row.logoContentType) {
      this.logoPreviewUrl.set(`data:${row.logoContentType};base64,${row.logoBase64}`);
      this.logoRemoved.set(false);
    } else {
      this.logoPreviewUrl.set(null);
    }
  }
}

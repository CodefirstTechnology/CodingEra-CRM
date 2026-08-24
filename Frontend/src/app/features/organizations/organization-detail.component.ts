import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { ContactsService } from '../../core/services/contacts.service';
import { DealsService } from '../../core/services/deals.service';
import { OrganizationsService } from '../../core/services/organizations.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { OrganizationMasterSelectService } from '../../core/services/organizations/organization-master-select.service';
import type { MasterDataOption } from '../../core/services/leads/lead-master-data.service';
import {
  masterOptionFormValue,
  masterSelectControlValue,
  resolveOrgMasterPick,
} from '../../core/services/organizations/organization-master-select.util';
import { dealStatusCssKind } from '../../core/services/deals/deal-status.constants';
import { IntlTelDisplayPipe } from '../../shared/pipes/intl-tel-display.pipe';
import type { DealPipelineStatus, DealRow } from '../deals/deals.component';
import type { ContactRow } from '../contacts/contacts.component';
import type { OrganizationRow } from './organizations.component';
import {
  GSTIN_ERROR_KEY,
  GSTIN_ERROR_MESSAGE,
  normalizeGstin,
  syncGstinInputFromEvent,
} from '../../shared/utils/gstin.util';
import { gstFormValidators, optionalUrlValidator } from '../../shared/validators/crm-validators';
import { TextFormatter } from '../../shared/utils/text-normalizer';

export type OrganizationMainTab = 'deals' | 'contacts';

@Component({
  selector: 'app-organization-detail',
  imports: [RouterLink, ReactiveFormsModule, IntlTelDisplayPipe],
  templateUrl: './organization-detail.component.html',
  styleUrl: './organization-detail.component.scss',
})
export class OrganizationDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly toast = inject(ToastService);
  private readonly dealsService = inject(DealsService);
  private readonly contactsService = inject(ContactsService);
  private readonly createRowBus = inject(CreateRowBusService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly organization = signal<OrganizationRow | null>(null);
  protected readonly orgMaster = inject(OrganizationMasterSelectService);
  protected readonly relatedDeals = signal<DealRow[]>([]);
  protected readonly relatedContacts = signal<ContactRow[]>([]);
  protected readonly mainTab = signal<OrganizationMainTab>('deals');
  protected readonly saving = signal(false);
  protected readonly resolved = signal(false);
  protected readonly detailsOpen = signal(true);

  protected readonly gstinErrorKey = GSTIN_ERROR_KEY;
  protected readonly gstinErrorMessage = GSTIN_ERROR_MESSAGE;
  protected readonly duplicateGstinOrg = signal<{ id: string | number; name: string } | null>(null);

  protected readonly detailForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    gst: ['', gstFormValidators()],
    territory: [''],
    industry: [''],
    employees: [''],
    address: [''],
  });

  protected onGstinInput(ev: Event): void {
    syncGstinInputFromEvent(ev, this.detailForm.controls.gst);
    this.clearGstinDuplicate();
  }

  protected onGstinBlur(): void {
    this.checkGstinDuplicate();
  }

  protected clearGstinDuplicate(): void {
    if (this.duplicateGstinOrg()) {
      this.duplicateGstinOrg.set(null);
    }
    const c = this.detailForm.get('gst');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected checkGstinDuplicate(): void {
    const rawGst = normalizeGstin(this.detailForm.getRawValue().gst);
    if (!rawGst) {
      this.clearGstinDuplicate();
      return;
    }
    const selfId = this.numericId();
    this.organizationsService
      .getAll()
      .pipe(take(1))
      .subscribe((all) => {
        const dup = all.find(
          (o) => normalizeGstin(o.gst) === rawGst && (selfId == null || Number(o.id) !== selfId),
        );
        if (dup) {
          this.duplicateGstinOrg.set({ id: dup.id, name: dup.name });
          const c = this.detailForm.get('gst');
          c?.setErrors({ ...(c.errors ?? {}), duplicate: true });
          c?.markAsTouched();
        } else {
          this.clearGstinDuplicate();
        }
      });
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.detailForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected readonly dealCount = computed(() => this.relatedDeals().length);
  protected readonly contactCount = computed(() => this.relatedContacts().length);

  constructor() {
    this.orgMaster.ensureLoaded().pipe(take(1)).subscribe();
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(id)) {
        this.numericId.set(null);
        this.organization.set(null);
        this.relatedDeals.set([]);
        this.relatedContacts.set([]);
        this.mainTab.set('deals');
        this.resolved.set(true);
        return;
      }
      this.numericId.set(id);
      this.resolved.set(false);
      this.mainTab.set('deals');
      this.loadOrganization(id);
    });

    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind === 'deal') this.refreshRelatedDeals();
      if (e.kind === 'contact') this.refreshRelatedContacts();
    });
  }

  private loadOrganization(id: number): void {
    this.organizationsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        this.organization.set(row);
        this.resolved.set(true);
        if (row) {
          this.patchDetailForm(row);
          this.refreshRelatedDeals();
          this.refreshRelatedContacts();
        } else {
          this.relatedDeals.set([]);
          this.relatedContacts.set([]);
        }
      });
  }

  protected masterOptValue(opt: MasterDataOption): string {
    return masterOptionFormValue(opt);
  }

  private patchDetailForm(row: OrganizationRow): void {
    let web = row.website === '—' ? '' : row.website;
    if (web.startsWith('https://')) web = web.slice(8);
    else if (web.startsWith('http://')) web = web.slice(7);

    this.detailForm.patchValue(
      {
        organizationName: row.name,
        website: web,
        gst: row.gst ?? '',
        industry: masterSelectControlValue(row.industryId, row.industry, this.orgMaster.industrySelectOptions()),
        employees: masterSelectControlValue(row.employeeCountId, row.employees, this.orgMaster.employeeSelectOptions()),
        territory: masterSelectControlValue(row.territoryId, row.territory, this.orgMaster.territorySelectOptions()),
        address: row.address ?? '',
      },
      { emitEvent: false },
    );
    this.detailForm.markAsPristine();
  }

  /** Matches persisted org name (Company on contacts uses this label). */
  private orgNameKey(): string {
    const row = this.organization();
    return (row?.name ?? '').trim().toLowerCase();
  }

  private refreshRelatedDeals(): void {
    const id = this.numericId();
    const oid = id != null ? String(id) : '';
    const nameKey = this.orgNameKey();
    if (!oid && !nameKey) {
      this.relatedDeals.set([]);
      return;
    }
    this.dealsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const scoped = rows.filter((d) => {
          const byId = oid.length > 0 && (d.relatedOrganizationId ?? '').trim() === oid;
          const byName =
            nameKey.length > 0 &&
            (d.organizationName ?? '').trim().toLowerCase() === nameKey;
          return byId || byName;
        });
        this.relatedDeals.set(scoped);
      });
  }

  private refreshRelatedContacts(): void {
    const nameKey = this.orgNameKey();
    if (!nameKey) {
      this.relatedContacts.set([]);
      return;
    }
    this.contactsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const scoped = rows.filter((c) => (c.organization ?? '').trim().toLowerCase() === nameKey);
        this.relatedContacts.set(scoped);
      });
  }

  protected organizationHeadline(): string {
    const row = this.organization();
    const name = this.detailForm.getRawValue().organizationName.trim();
    return name || row?.name?.trim() || 'Organization';
  }

  protected avatarLetters(): string {
    const name = this.organizationHeadline().trim();
    if (!name) return '?';
    const alnum = name.replace(/[^a-zA-Z0-9]/g, '');
    const ch = (alnum || name).charAt(0);
    return ch.toUpperCase();
  }

  protected sidebarPlaceholder(label: string): string {
    return `Add ${label}...`;
  }

  protected setMainTab(tab: OrganizationMainTab): void {
    this.mainTab.set(tab);
  }

  protected contactLabel(row: ContactRow): string {
    const combined = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(' ');
    if (combined) return combined;
    const local = row.email?.split('@')[0]?.trim();
    return local || row.email || 'Contact';
  }

  protected contactInitial(row: ContactRow): string {
    const label = this.contactLabel(row);
    const cleaned = label.replace(/[^a-zA-Z0-9]/g, '');
    const ch = (cleaned || label).charAt(0);
    return ch ? ch.toUpperCase() : '?';
  }

  protected toggleDetails(): void {
    this.detailsOpen.update((o) => !o);
  }

  protected discardDetailEdits(): void {
    const row = this.organization();
    if (row) this.patchDetailForm(row);
  }

  protected saveDetails(): void {
    const idn = this.numericId();
    const row = this.organization();
    if (idn == null || !row) return;
    TextFormatter.form(this.detailForm);
    this.detailForm.markAllAsTouched();
    if (this.detailForm.invalid) return;

    const v = this.detailForm.getRawValue();
    const nameTrim = v.organizationName.trim();
    const nameLower = nameTrim.toLowerCase();
    const selfId = row.id;

    this.organizationsService
      .getAll()
      .pipe(take(1))
      .subscribe((all) => {
        const dup = all.some((o) => o.name.toLowerCase() === nameLower && o.id !== selfId);
        if (dup) {
          const nc = this.detailForm.get('organizationName');
          nc?.setErrors({ ...(nc.errors ?? {}), duplicate: true });
          nc?.markAsTouched();
          return;
        }

        const rawGst = normalizeGstin(v.gst);
        if (rawGst) {
          const dupGst = all.find((o) => normalizeGstin(o.gst) === rawGst && o.id !== selfId);
          if (dupGst) {
            this.duplicateGstinOrg.set({ id: dupGst.id, name: dupGst.name });
            const gc = this.detailForm.get('gst');
            gc?.setErrors({ ...(gc.errors ?? {}), duplicate: true });
            gc?.markAsTouched();
            return;
          }
        }

        this.clearOrgNameDupError();
        this.clearGstinDuplicate();
        this.saving.set(true);

        let web = v.website.trim();
        if (web && !/^https?:\/\//i.test(web)) {
          web = `https://${web}`;
        }

        const industryPick = resolveOrgMasterPick(v.industry, this.orgMaster.industrySelectOptions());
        const employeePick = resolveOrgMasterPick(v.employees, this.orgMaster.employeeSelectOptions());
        const territoryPick = resolveOrgMasterPick(v.territory, this.orgMaster.territorySelectOptions());

        const payload: Omit<OrganizationRow, 'id'> = {
          name: TextFormatter.entityName('organization', nameTrim),
          website: web || '—',
          gst: TextFormatter.gstin(v.gst) || undefined,
          industry:
            industryPick.label ||
            this.orgMaster.industrySelectOptions()[0]?.name ||
            row.industry ||
            '',
          annualRevenue: row.annualRevenue,
          lastModified: 'Just now',
          employees:
            employeePick.label ||
            this.orgMaster.employeeSelectOptions()[0]?.name ||
            row.employees ||
            '1-10',
          territory: territoryPick.label.trim() || undefined,
          industryId: industryPick.masterId,
          employeeCountId: employeePick.masterId,
          territoryId: territoryPick.masterId,
          address: v.address.trim() || undefined,
        };

        this.organizationsService
          .update(idn, payload)
          .pipe(take(1))
          .subscribe({
            next: (updated) => {
              this.saving.set(false);
              if (updated) {
                this.organization.set(updated);
                this.patchDetailForm(updated);
                this.refreshRelatedDeals();
                this.refreshRelatedContacts();
                this.toast.success('Organization saved.');
              }
            },
            error: (e: any) => {
              this.saving.set(false);
              const errBody = e?.error;
              if (e?.status === 409 && errBody?.existingId != null) {
                this.duplicateGstinOrg.set({ id: errBody.existingId, name: errBody.existingName || 'Existing Organization' });
                const gc = this.detailForm.get('gst');
                gc?.setErrors({ ...(gc.errors ?? {}), duplicate: true });
                gc?.markAsTouched();
              } else {
                this.toast.error(leadsHttpErrorMessage(e));
              }
            },
          });
      });
  }

  protected clearOrgNameDupError(): void {
    const c = this.detailForm.get('organizationName');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected dealStatusDotClass(status: DealPipelineStatus): string {
    const kind = dealStatusCssKind(status);
    return kind === 'demo' ? 'org-detail__status-dot org-detail__status-dot--demo' : 'org-detail__status-dot';
  }

  protected dealStatusClass(status: DealPipelineStatus): string {
    const kind = dealStatusCssKind(status);
    switch (kind) {
      case 'won':
        return 'org-detail__pill org-detail__pill--ok';
      case 'lost':
        return 'org-detail__pill org-detail__pill--bad';
      case 'demo':
        return 'org-detail__pill org-detail__pill--demo';
      case 'accent':
        return 'org-detail__pill org-detail__pill--accent';
      default:
        return 'org-detail__pill org-detail__pill--muted';
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

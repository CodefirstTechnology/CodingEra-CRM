import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import type { DealPipelineStatus, DealRow } from '../deals/deals.component';
import type { ContactRow } from '../contacts/contacts.component';
import type { OrganizationRow } from './organizations.component';

export type OrganizationMainTab = 'deals' | 'contacts';

@Component({
  selector: 'app-organization-detail',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './organization-detail.component.html',
  styleUrl: './organization-detail.component.scss',
})
export class OrganizationDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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

  protected readonly addressOptions = [
    '',
    'Mumbai, Maharashtra',
    'Bengaluru, Karnataka',
    'Hyderabad, Telangana',
    'Pune, Maharashtra',
    'Chennai, Tamil Nadu',
    'New Delhi, Delhi',
    'Other',
  ] as const;

  protected readonly detailForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', Validators.maxLength(200)],
    territory: [''],
    industry: [''],
    employees: [''],
    address: [''],
  });

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

        this.clearOrgNameDupError();
        this.saving.set(true);

        let web = v.website.trim();
        if (web && !/^https?:\/\//i.test(web)) {
          web = `https://${web}`;
        }

        const industryPick = resolveOrgMasterPick(v.industry, this.orgMaster.industrySelectOptions());
        const employeePick = resolveOrgMasterPick(v.employees, this.orgMaster.employeeSelectOptions());
        const territoryPick = resolveOrgMasterPick(v.territory, this.orgMaster.territorySelectOptions());

        const payload: Omit<OrganizationRow, 'id'> = {
          name: nameTrim,
          website: web || '—',
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
            error: (e: unknown) => {
              this.saving.set(false);
              this.toast.error(leadsHttpErrorMessage(e));
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

  protected confirmDeleteOrganization(): void {
    const idn = this.numericId();
    if (idn == null) return;
    if (!confirm('Delete this organization?')) return;
    this.organizationsService
      .delete(idn)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toast.success('Organization deleted.');
          void this.router.navigateByUrl('/organizations');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
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

  protected dealOwnerInitials(d: DealRow): string {
    const i = d.assignedInitials?.trim();
    if (i) return i.charAt(0).toUpperCase();
    const n = d.assignedTo?.trim();
    return n ? n.charAt(0).toUpperCase() : '?';
  }
}

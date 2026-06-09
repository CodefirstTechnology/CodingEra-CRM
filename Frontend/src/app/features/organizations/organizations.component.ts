import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
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
import { optionalUrlValidator } from '../../shared/validators/crm-validators';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import { createIdSelection } from '../../shared/utils/selection-manager';

export interface OrganizationRow {
  id: string;
  name: string;
  website: string;
  gst?: string;
  industry: string;
  annualRevenue: number;

  lastModified: string;
  employees?: string;
  territory?: string;
  /** `GET /api/organizations` may expose FKs for MasterData dropdown round-trip. */
  industryId?: number;
  employeeCountId?: number;
  territoryId?: number;
  /** Street-level or city line for org HQ (shown on organization detail sidebar). */
  address?: string;
}

@Component({
  selector: 'app-organizations',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './organizations.component.html',
  styleUrl: './organizations.component.scss',
})
export class OrganizationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly toast = inject(ToastService);
  protected readonly orgMaster = inject(OrganizationMasterSelectService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);

  protected readonly rows = signal<OrganizationRow[]>([]);

  protected masterOptValue(opt: MasterDataOption): string {
    return masterOptionFormValue(opt);
  }

  constructor() {
    this.orgMaster.ensureLoaded().pipe(take(1)).subscribe();
    this.refreshOrganizations();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'organization') return;
      this.refreshOrganizations();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      if (q['create'] === '1') {
        this.openForm();
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { create: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        return;
      }
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshOrganizations(): void {
    this.organizationsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
  );

  protected readonly createForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    industry: ['', Validators.required],
    annualRevenue: ['', Validators.maxLength(40)],
    employees: [''],
    territory: [''],
  });

  private clearEditQuery(): void {
    this.lastRouteEdit = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
    });
  }

  protected isRowSelected(id: string): boolean {
    return this.sel.isSelected(id);
  }

  protected toggleRow(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.sel.toggle(id);
  }

  protected toggleSelectAll(): void {
    this.sel.toggleSelectAll(this.rows().map((r) => r.id));
  }

  private defaultIndustryFormValue(): string {
    const o = this.orgMaster.industrySelectOptions()[0];
    return o ? masterOptionFormValue(o) : '';
  }

  private defaultEmployeesFormValue(): string {
    const o = this.orgMaster.employeeSelectOptions()[0];
    return o ? masterOptionFormValue(o) : '';
  }

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.createForm.reset({
      organizationName: '',
      website: '',
      industry: this.defaultIndustryFormValue(),
      annualRevenue: '',
      employees: this.defaultEmployeesFormValue(),
      territory: '',
    });
    this.createForm.markAsUntouched();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.createForm.reset({
      organizationName: '',
      website: '',
      industry: this.defaultIndustryFormValue(),
      annualRevenue: '',
      employees: this.defaultEmployeesFormValue(),
      territory: '',
    });
    this.createForm.markAsUntouched();
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.organizationsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        let web = !row.website || row.website === '—' ? '' : row.website;
        if (web.startsWith('https://')) web = web.slice(8);
        else if (web.startsWith('http://')) web = web.slice(7);
        const revInput = row.annualRevenue != null && row.annualRevenue !== 0 ? String(row.annualRevenue) : '';
        const indOpts = this.orgMaster.industrySelectOptions();
        const empOpts = this.orgMaster.employeeSelectOptions();
        const terrOpts = this.orgMaster.territorySelectOptions();
        this.createForm.patchValue({
          organizationName: row.name,
          website: web,
          industry: masterSelectControlValue(row.industryId, row.industry, indOpts),
          annualRevenue: revInput,
          employees: masterSelectControlValue(row.employeeCountId, row.employees, empOpts),
          territory: masterSelectControlValue(row.territoryId, row.territory, terrOpts),
        });
        this.formOpen.set(true);
      });
  }

  protected onBulkEdit(): void {
    const ids = this.sel.selectedItems();
    if (ids.length !== 1) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: ids[0] },
      queryParamsHandling: 'merge',
    });
    this.beginEditFromRoute(ids[0]);
  }

  protected onBulkDelete(): void {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    forkJoin(ids.map((sid) => this.organizationsService.delete(Number(sid)).pipe(take(1)))).subscribe({
      next: () => {
        this.sel.clear();
        this.refreshOrganizations();
        const n = ids.length;
        this.toast.success(n === 1 ? 'Organization deleted.' : `${n} organizations deleted.`);
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected formatOrgRevenue(value: number): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '₹ 0';
    return `₹ ${value.toLocaleString('en-IN')}`;
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected submitOrganization(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const nameTrim = raw.organizationName.trim();
    const editId = this.editingNumericId();
    if (
      this.rows().some(
        (r) =>
          r.name.toLowerCase() === nameTrim.toLowerCase() &&
          (editId == null || Number(r.id) !== editId),
      )
    ) {
      const c = this.createForm.get('organizationName');
      c?.setErrors({ ...(c.errors ?? {}), duplicate: true });
      c?.markAsTouched();
      return;
    }

    let web = raw.website.trim();
    if (web && !/^https?:\/\//i.test(web)) {
      web = `https://${web}`;
    }

    const industryPick = resolveOrgMasterPick(raw.industry, this.orgMaster.industrySelectOptions());
    const employeePick = resolveOrgMasterPick(raw.employees, this.orgMaster.employeeSelectOptions());
    const territoryPick = resolveOrgMasterPick(raw.territory, this.orgMaster.territorySelectOptions());

    const payload: Omit<OrganizationRow, 'id'> = {
      name: nameTrim,
      website: web || '',
      industry:
        industryPick.label ||
        this.orgMaster.industrySelectOptions()[0]?.name ||
        'Technology',
      annualRevenue: parseRevenueInputToNumber(raw.annualRevenue),
      lastModified: 'Just now',
      employees:
        employeePick.label ||
        this.orgMaster.employeeSelectOptions()[0]?.name ||
        '1-10',
      territory: territoryPick.label.trim() || undefined,
      industryId: industryPick.masterId,
      employeeCountId: employeePick.masterId,
      territoryId: territoryPick.masterId,
    };

    const done = () => {
      this.sel.clear();
      this.refreshOrganizations();
      this.closeForm();
    };

    if (editId != null) {
      this.organizationsService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Organization updated.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    } else {
      this.organizationsService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Organization created.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    }
  }

  protected deleteOrganization(row: OrganizationRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.organizationsService
      .delete(id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.sel.removeId(row.id);
          this.refreshOrganizations();
          this.toast.success('Organization deleted.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected clearNameDuplicate(): void {
    const c = this.createForm.get('organizationName');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }
}

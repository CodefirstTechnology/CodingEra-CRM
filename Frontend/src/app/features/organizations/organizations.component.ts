import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { OrganizationsService } from '../../core/services/organizations.service';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { createIdSelection } from '../../shared/utils/selection-manager';

export interface OrganizationRow {
  id: string;
  name: string;
  website: string;
  industry: string;
  annualRevenue: string;
  lastModified: string;
}

@Component({
  selector: 'app-organizations',
  imports: [ReactiveFormsModule, CrmSelectionBarComponent],
  templateUrl: './organizations.component.html',
  styleUrl: './organizations.component.scss',
})
export class OrganizationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);

  protected readonly employeeOptions = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
  protected readonly territoryOptions = ['', 'India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;
  protected readonly industryOptions = [
    'Technology',
    'Finance',
    'Healthcare',
    'Manufacturing',
    'Retail',
    'Education',
    'Other',
  ] as const;

  protected readonly rows = signal<OrganizationRow[]>([]);

  constructor() {
    this.refreshOrganizations();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'organization') return;
      this.refreshOrganizations();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
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
    website: ['', Validators.maxLength(200)],
    industry: ['Technology', Validators.required],
    annualRevenue: ['', Validators.maxLength(40)],
    employees: ['1-10'],
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

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.createForm.reset({
      organizationName: '',
      website: '',
      industry: 'Technology',
      annualRevenue: '',
      employees: '1-10',
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
      industry: 'Technology',
      annualRevenue: '',
      employees: '1-10',
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
        const rev = row.annualRevenue?.trim() ?? '';
        const revInput = rev.startsWith('₹') ? rev.replace(/^₹\s*/, '').trim() : rev;
        let web = row.website === '—' ? '' : row.website;
        if (web.startsWith('https://')) web = web.slice(8);
        else if (web.startsWith('http://')) web = web.slice(7);
        this.createForm.patchValue({
          organizationName: row.name,
          website: web,
          industry: row.industry,
          annualRevenue: revInput,
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
    forkJoin(ids.map((sid) => this.organizationsService.delete(Number(sid)).pipe(take(1)))).subscribe(
      () => {
        this.sel.clear();
        this.refreshOrganizations();
      },
    );
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
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

    const displayRev = raw.annualRevenue.trim() ? `₹ ${raw.annualRevenue.trim()}` : '₹ 0.00';
    let web = raw.website.trim();
    if (web && !/^https?:\/\//i.test(web)) {
      web = `https://${web}`;
    }

    const payload: Omit<OrganizationRow, 'id'> = {
      name: nameTrim,
      website: web || '—',
      industry: raw.industry,
      annualRevenue: displayRev,
      lastModified: 'Just now',
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
        .subscribe(() => done());
    } else {
      this.organizationsService
        .create(payload)
        .pipe(take(1))
        .subscribe(() => done());
    }
  }

  protected deleteOrganization(row: OrganizationRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.organizationsService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.sel.removeId(row.id);
        this.refreshOrganizations();
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

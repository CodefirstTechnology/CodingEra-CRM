import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { OrganizationsService } from '../../core/services/organizations.service';

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
  imports: [ReactiveFormsModule],
  templateUrl: './organizations.component.html',
  styleUrl: './organizations.component.scss',
})
export class OrganizationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly organizationsService = inject(OrganizationsService);

  protected readonly formOpen = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());

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
  }

  private refreshOrganizations(): void {
    this.organizationsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() => {
    const ids = this.rows().map((r) => r.id);
    if (ids.length === 0) return false;
    const sel = this.selectedIds();
    return ids.every((id) => sel.has(id));
  });

  protected readonly createForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    website: ['', Validators.maxLength(200)],
    industry: ['Technology', Validators.required],
    annualRevenue: ['', Validators.maxLength(40)],
    employees: ['1-10'],
    territory: [''],
  });

  protected isRowSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected toggleRow(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.selectedIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleSelectAll(): void {
    const ids = this.rows().map((r) => r.id);
    this.selectedIds.update((prev) => {
      if (ids.length && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }

  protected openForm(): void {
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

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected submitOrganization(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const nameTrim = raw.organizationName.trim();
    if (this.rows().some((r) => r.name.toLowerCase() === nameTrim.toLowerCase())) {
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

    this.organizationsService
      .create(payload)
      .pipe(take(1))
      .subscribe(() => {
        this.refreshOrganizations();
        this.closeForm();
      });
  }

  protected deleteOrganization(row: OrganizationRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.organizationsService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.selectedIds.update((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
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

import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';

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

  protected readonly rows = signal<OrganizationRow[]>([
    {
      id: 'o1',
      name: 'Acme Ltd',
      website: 'https://acme.example',
      industry: 'Technology',
      annualRevenue: '₹ 12,40,000',
      lastModified: '2h ago',
    },
    {
      id: 'o2',
      name: 'Globex Corp',
      website: 'https://globex.example',
      industry: 'Manufacturing',
      annualRevenue: '₹ 45,00,000',
      lastModified: 'Yesterday',
    },
    {
      id: 'o3',
      name: 'Northwind Traders',
      website: 'https://northwind.example',
      industry: 'Retail',
      annualRevenue: '₹ 8,20,500',
      lastModified: '3d ago',
    },
    {
      id: 'o4',
      name: 'Initech',
      website: '—',
      industry: 'Finance',
      annualRevenue: '₹ 2,10,000',
      lastModified: '1w ago',
    },
  ]);

  constructor() {
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'organization') return;
      const row = e.row as OrganizationRow;
      if (this.rows().some((r) => r.name.toLowerCase() === row.name.toLowerCase())) {
        return;
      }
      this.rows.update((list) => [row, ...list]);
    });
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

    const row: OrganizationRow = {
      id: crypto.randomUUID(),
      name: nameTrim,
      website: web || '—',
      industry: raw.industry,
      annualRevenue: displayRev,
      lastModified: 'Just now',
    };

    this.rows.update((list) => [row, ...list]);
    this.closeForm();
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

import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Lost';

export interface LeadOwnerOption {
  id: string;
  label: string;
  initials: string;
}

export interface LeadRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  salutation?: string;
  mobile?: string;
  gender?: string;
  email: string;
  organization: string;
  employees?: string;
  annualRevenue?: string;
  website?: string;
  territory?: string;
  industry: string;
  status: LeadStatus;
  requestType?: string;
  notes?: string;
  leadOwnerName: string;
  owner: string;
  updated: string;
}

export type StatusFilter = 'all' | LeadStatus;

@Component({
  selector: 'app-leads',
  imports: [ReactiveFormsModule],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.scss',
})
export class LeadsComponent {
  private readonly fb = inject(FormBuilder);

  protected readonly formOpen = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly statusOptions: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Lost'];
  protected readonly salutationOptions = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;
  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;
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
  protected readonly requestTypeOptions = ['', 'Sales', 'Support', 'Partnership', 'General inquiry'] as const;

  protected readonly leadOwnerOptions: LeadOwnerOption[] = [
   
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly filterChips: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'New', label: 'New' },
    { id: 'Contacted', label: 'Contacted' },
    { id: 'Qualified', label: 'Qualified' },
    { id: 'Lost', label: 'Lost' },
  ];

  protected readonly rows = signal<LeadRow[]>([
    {
      id: 'seed-1',
      firstName: 'Priya',
      lastName: 'Sharma',
      name: 'Priya Sharma',
      organization: 'Acme Ltd',
      email: 'priya@acme.example',
      status: 'Qualified',
      industry: 'Technology',
      owner: 'SK',
      leadOwnerName: 'Sam Kumar',
      updated: '2h ago',
    },
    {
      id: 'seed-2',
      firstName: 'Alex',
      lastName: 'Rivera',
      name: 'Alex Rivera',
      organization: 'Globex',
      email: 'alex@globex.example',
      status: 'Contacted',
      industry: 'Manufacturing',
      owner: 'AM',
      leadOwnerName: 'Alex Morgan',
      updated: '5h ago',
    },
    {
      id: 'seed-3',
      firstName: 'Jordan',
      lastName: 'Lee',
      name: 'Jordan Lee',
      organization: 'Initech',
      email: 'jordan@initech.example',
      status: 'New',
      industry: 'Finance',
      owner: 'JD',
      leadOwnerName: 'Jordan Doe',
      updated: 'Yesterday',
    },
    {
      id: 'seed-4',
      firstName: 'Sam',
      lastName: 'Taylor',
      name: 'Sam Taylor',
      organization: 'Northwind',
      email: 'sam@northwind.example',
      status: 'New',
      industry: 'Retail',
      owner: 'SK',
      leadOwnerName: 'Sam Kumar',
      updated: 'Yesterday',
    },
    {
      id: 'seed-5',
      firstName: 'Casey',
      lastName: 'Morgan',
      name: 'Casey Morgan',
      organization: 'Umbrella Corp',
      email: 'casey@umbrella.example',
      status: 'Lost',
      industry: 'Other',
      owner: 'AM',
      leadOwnerName: 'Alex Morgan',
      updated: '3d ago',
    },
  ]);

  protected readonly filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const st = this.statusFilter();
    return this.rows().filter((row) => {
      if (st !== 'all' && row.status !== st) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.firstName.toLowerCase().includes(q) ||
        row.lastName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.mobile?.toLowerCase().includes(q) ?? false) ||
        row.organization.toLowerCase().includes(q) ||
        row.owner.toLowerCase().includes(q) ||
        row.leadOwnerName.toLowerCase().includes(q) ||
        row.industry.toLowerCase().includes(q) ||
        (row.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  protected readonly createForm = this.fb.nonNullable.group({
    salutation: [''],
    lastName: ['', Validators.maxLength(120)],
    mobile: ['', Validators.maxLength(40)],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.email, Validators.maxLength(160)]],
    gender: [''],
    organization: ['', [Validators.required, Validators.maxLength(160)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(32)],
    website: ['', Validators.maxLength(200)],
    territory: [''],
    industry: ['Technology', Validators.required],
    status: this.fb.nonNullable.control<LeadStatus>('New', Validators.required),
    leadOwner: ['RD', Validators.required],
    requestType: [''],
    customField: ['', Validators.maxLength(240)],
  });

  protected openForm(): void {
    this.createForm.reset({
      salutation: '',
      lastName: '',
      mobile: '',
      firstName: '',
      email: '',
      gender: '',
      organization: '',
      employees: '1-10',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: 'Technology',
      status: 'New',
      leadOwner: 'RD',
      requestType: '',
      customField: '',
    });
    this.createForm.markAsUntouched();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.createForm.reset({
      salutation: '',
      lastName: '',
      mobile: '',
      firstName: '',
      email: '',
      gender: '',
      organization: '',
      employees: '1-10',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: 'Technology',
      status: 'New',
      leadOwner: 'RD',
      requestType: '',
      customField: '',
    });
    this.createForm.markAsUntouched();
  }

  protected clearEmailDuplicate(): void {
    const emailCtrl = this.createForm.get('email');
    const errs = emailCtrl?.errors;
    if (!emailCtrl || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    emailCtrl.setErrors(Object.keys(next).length ? next : null);
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected setStatusFilter(id: StatusFilter): void {
    this.statusFilter.set(id);
  }

  protected isChipActive(id: StatusFilter): boolean {
    return this.statusFilter() === id;
  }

  private buildDisplayName(
    salutation: string,
    first: string,
    last: string,
  ): string {
    const parts = [salutation.trim(), first.trim(), last.trim()].filter(Boolean);
    return parts.join(' ').trim() || first.trim() || last.trim() || 'Lead';
  }

  protected submitLead(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const emailTrim = raw.email.trim();
    const emailLower = emailTrim.toLowerCase();
    const emailCtrl = this.createForm.get('email');
    if (
      emailTrim &&
      this.rows().some((r) => r.email.toLowerCase() === emailLower)
    ) {
      if (emailCtrl) {
        emailCtrl.setErrors({ ...(emailCtrl.errors ?? {}), duplicate: true });
        emailCtrl.markAsTouched();
      }
      return;
    }

    const ownerOpt = this.leadOwnerOptions.find((o) => o.id === raw.leadOwner);
    const initials = ownerOpt?.initials ?? raw.leadOwner;
    const leadOwnerName = ownerOpt?.label ?? raw.leadOwner;

    const row: LeadRow = {
      id: crypto.randomUUID(),
      salutation: raw.salutation || undefined,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      name: this.buildDisplayName(raw.salutation, raw.firstName, raw.lastName),
      mobile: raw.mobile.trim() || undefined,
      gender: raw.gender || undefined,
      email: emailTrim,
      organization: raw.organization.trim(),
      employees: raw.employees,
      annualRevenue: raw.annualRevenue.trim() || undefined,
      website: raw.website.trim() || undefined,
      territory: raw.territory || undefined,
      industry: raw.industry,
      status: raw.status,
      requestType: raw.requestType || undefined,
      notes: raw.customField.trim() || undefined,
      leadOwnerName,
      owner: initials,
      updated: 'Just now',
    };

    this.rows.update((list) => [row, ...list]);
    this.closeForm();
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected statusClass(status: LeadStatus): string {
    switch (status) {
      case 'Qualified':
        return 'leads__tag leads__tag--ok';
      case 'Contacted':
        return 'leads__tag leads__tag--accent';
      case 'Lost':
        return 'leads__tag leads__tag--bad';
      default:
        return 'leads__tag leads__tag--muted';
    }
  }

  protected hasActiveFilters(): boolean {
    return this.statusFilter() !== 'all' || this.searchQuery().trim().length > 0;
  }
}

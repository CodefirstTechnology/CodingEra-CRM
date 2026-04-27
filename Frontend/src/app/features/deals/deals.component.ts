import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export type DealPipelineStatus =
  | 'Qualification'
  | 'Proposal'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

export interface DealOwnerOption {
  id: string;
  label: string;
  initials: string;
}

export interface DealRow {
  id: string;
  organization: string;
  annualRevenue: string;
  status: DealPipelineStatus;
  email: string;
  mobile: string;
  assignedTo: string;
  assignedInitials: string;
  lastModified: string;
}

@Component({
  selector: 'app-deals',
  imports: [ReactiveFormsModule],
  templateUrl: './deals.component.html',
  styleUrl: './deals.component.scss',
})
export class DealsComponent {
  private readonly fb = inject(FormBuilder);

  protected readonly formOpen = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());

  protected readonly dealStatuses: DealPipelineStatus[] = [
    'Qualification',
    'Proposal',
    'Negotiation',
    'Closed Won',
    'Closed Lost',
  ];

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

  protected readonly dealOwnerOptions: DealOwnerOption[] = [
    
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  protected readonly rows = signal<DealRow[]>([
   
    {
      id: 'd2',
      organization: 'Globex Corp',
      annualRevenue: '₹ 45,00,000',
      status: 'Qualification',
      email: 'sales@globex.example',
      mobile: '+91 91234 56789',
      assignedTo: 'Sam Kumar',
      assignedInitials: 'SK',
      lastModified: 'Yesterday',
    },
    {
      id: 'd3',
      organization: 'Northwind Traders',
      annualRevenue: '₹ 8,20,500',
      status: 'Proposal',
      email: 'info@northwind.example',
      mobile: '+91 99887 76655',
      assignedTo: 'Alex Morgan',
      assignedInitials: 'AM',
      lastModified: '3d ago',
    },
    {
      id: 'd4',
      organization: 'Initech',
      annualRevenue: '₹ 2,10,000',
      status: 'Closed Won',
      email: 'partners@initech.example',
      mobile: '+91 90011 22334',
      assignedTo: 'Jordan Doe',
      assignedInitials: 'JD',
      lastModified: '1w ago',
    },
  ]);

  protected readonly allSelected = computed(() => {
    const ids = this.rows().map((r) => r.id);
    if (ids.length === 0) return false;
    const sel = this.selectedIds();
    return ids.every((id) => sel.has(id));
  });

  protected readonly createForm = this.fb.nonNullable.group({
    useExistingOrg: [false],
    useExistingContact: [false],
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(40)],
    website: ['', Validators.maxLength(200)],
    territory: [''],
    industry: ['Technology', Validators.required],
    salutation: [''],
    lastName: ['', Validators.maxLength(120)],
    primaryMobile: ['', Validators.maxLength(40)],
    firstName: ['', Validators.maxLength(80)],
    primaryEmail: ['', [Validators.email, Validators.maxLength(160)]],
    gender: [''],
    status: this.fb.nonNullable.control<DealPipelineStatus>('Qualification', Validators.required),
    dealOwner: ['RD', Validators.required],
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
    this.resetCreateForm();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.resetCreateForm();
  }

  private resetCreateForm(): void {
    this.createForm.reset({
      useExistingOrg: false,
      useExistingContact: false,
      organizationName: '',
      employees: '1-10',
      annualRevenue: '',
      website: '',
      territory: '',
      industry: 'Technology',
      salutation: '',
      lastName: '',
      primaryMobile: '',
      firstName: '',
      primaryEmail: '',
      gender: '',
      status: 'Qualification',
      dealOwner: 'RD',
    });
    this.createForm.markAsUntouched();
  }

  protected clearEmailDuplicate(): void {
    const c = this.createForm.get('primaryEmail');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected fieldInvalid(name: string): boolean {
    const c = this.createForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected submitDeal(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const emailTrim = raw.primaryEmail.trim();
    if (
      emailTrim &&
      this.rows().some((r) => r.email.toLowerCase() === emailTrim.toLowerCase())
    ) {
      const c = this.createForm.get('primaryEmail');
      c?.setErrors({ ...(c.errors ?? {}), duplicate: true });
      c?.markAsTouched();
      return;
    }

    const owner = this.dealOwnerOptions.find((o) => o.id === raw.dealOwner);
    const displayRev = raw.annualRevenue.trim() ? `₹ ${raw.annualRevenue.trim()}` : '₹ 0.00';

    const row: DealRow = {
      id: crypto.randomUUID(),
      organization: raw.organizationName.trim(),
      annualRevenue: displayRev,
      status: raw.status,
      email: emailTrim || '—',
      mobile: raw.primaryMobile.trim() || '—',
      assignedTo: owner?.label ?? raw.dealOwner,
      assignedInitials: owner?.initials ?? '—',
      lastModified: 'Just now',
    };

    this.rows.update((list) => [row, ...list]);
    this.closeForm();
  }

  protected statusClass(status: DealPipelineStatus): string {
    switch (status) {
      case 'Closed Won':
        return 'deals__tag deals__tag--ok';
      case 'Closed Lost':
        return 'deals__tag deals__tag--bad';
      case 'Negotiation':
      case 'Proposal':
        return 'deals__tag deals__tag--accent';
      default:
        return 'deals__tag deals__tag--muted';
    }
  }
}

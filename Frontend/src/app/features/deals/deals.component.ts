import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { DealsService } from '../../core/services/deals.service';
import { CrmAssignPickerComponent } from '../../shared/components/crm-assign-picker/crm-assign-picker.component';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import { optionalPhoneValidator, optionalUrlValidator } from '../../shared/validators/crm-validators';
import { createIdSelection } from '../../shared/utils/selection-manager';

export type DealPipelineStatus =
  | 'Qualification'
  | 'Proposal'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost'
  | 'Demo/Making';

export interface DealOwnerOption {
  id: string;
  label: string;
  initials: string;
}

export interface DealRow {
  id: string;
  organizationName: string;
  employees: string;
  /** Stored as a plain number (no currency formatting). */
  annualRevenue: number;
  website: string;
  territory: string;
  industry: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  gender: string;
  status: DealPipelineStatus;
  /** Form / owner picker key (e.g. SK). */
  dealOwnerId: string;
  assignedTo: string;
  assignedInitials: string;
  lastModified: string;
  /** When set, deal appears on the matching contact's detail "Deals" tab (mock UX). */
  relatedContactId?: string;
  /** When set, deal appears on the matching organization's detail "Deals" tab (mock UX). */
  relatedOrganizationId?: string;
}

@Component({
  selector: 'app-deals',
  imports: [ReactiveFormsModule, CrmSelectionBarComponent, CrmAssignPickerComponent],
  templateUrl: './deals.component.html',
  styleUrl: './deals.component.scss',
})
export class DealsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly dealsService = inject(DealsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly assignPickerOpen = signal(false);
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);

  protected readonly dealStatuses: DealPipelineStatus[] = [
    'Qualification',
    'Proposal',
    'Negotiation',
    'Demo/Making',
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

  protected readonly rows = signal<DealRow[]>([]);

  constructor() {
    this.refreshDeals();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'deal') return;
      this.refreshDeals();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshDeals(): void {
    this.dealsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
  );

  protected readonly assignDefaultOwnerId = computed(() => {
    const ids = this.sel.selectedItems();
    const first = this.rows().find((r) => r.id === ids[0]);
    if (!first) return 'SK';
    return (
      this.dealOwnerOptions.find(
        (o) =>
          o.id === first.dealOwnerId ||
          o.initials === first.assignedInitials ||
          o.label === first.assignedTo,
      )?.id ?? 'SK'
    );
  });

  protected readonly createForm = this.fb.nonNullable.group({
    useExistingOrg: [false],
    useExistingContact: [false],
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    employees: ['1-10'],
    annualRevenue: ['', Validators.maxLength(40)],
    website: ['', [Validators.maxLength(200), optionalUrlValidator()]],
    territory: [''],
    industry: ['Technology', Validators.required],
    salutation: [''],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    primaryMobile: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    primaryEmail: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    gender: [''],
    status: this.fb.nonNullable.control<DealPipelineStatus>('Qualification', Validators.required),
    dealOwner: ['SK', Validators.required],
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
    this.resetCreateForm();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
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
      dealOwner: 'SK',
    });
    this.applyPrimaryEmailValidators('create');
    this.createForm.markAsUntouched();
  }

  /** Create always requires email; edit keeps legacy rows without email valid. */
  private applyPrimaryEmailValidators(mode: 'create' | 'edit-empty' | 'edit-filled'): void {
    const c = this.createForm.get('primaryEmail');
    if (!c) return;
    if (mode === 'create' || mode === 'edit-filled') {
      c.setValidators([Validators.required, Validators.email, Validators.maxLength(160)]);
    } else {
      c.setValidators([Validators.email, Validators.maxLength(160)]);
    }
    c.updateValueAndValidity({ emitEvent: false });
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.dealsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        const ownerOpt = this.dealOwnerOptions.find(
          (o) =>
            o.id === row.dealOwnerId ||
            o.initials === row.assignedInitials ||
            o.label === row.assignedTo,
        );
        const revInput =
          row.annualRevenue != null && row.annualRevenue !== 0 ? String(row.annualRevenue) : '';
        const emailFromRow = row.email.trim() ? row.email : '';
        this.applyPrimaryEmailValidators(emailFromRow.trim() ? 'edit-filled' : 'edit-empty');
        this.createForm.patchValue({
          organizationName: row.organizationName,
          employees: row.employees,
          annualRevenue: revInput,
          website: row.website,
          territory: row.territory,
          industry: row.industry,
          salutation: row.salutation,
          primaryEmail: emailFromRow,
          primaryMobile: row.mobile,
          firstName: row.firstName || 'Contact',
          lastName: row.lastName || 'Primary',
          gender: row.gender,
          status: row.status,
          dealOwner: ownerOpt?.id ?? (row.dealOwnerId || 'SK'),
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
    forkJoin(ids.map((sid) => this.dealsService.delete(Number(sid)).pipe(take(1)))).subscribe(() => {
      this.sel.clear();
      this.refreshDeals();
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected onAssignToMenu(): void {
    this.assignPickerOpen.set(true);
  }

  protected onAssignClosed(): void {
    this.assignPickerOpen.set(false);
  }

  protected onAssignPicked(ownerKey: string): void {
    const opt = this.dealOwnerOptions.find((o) => o.id === ownerKey);
    if (!opt) {
      this.assignPickerOpen.set(false);
      return;
    }
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.dealsService
        .update(Number(sid), {
          assignedTo: opt.label,
          assignedInitials: opt.initials,
          dealOwnerId: opt.id,
          lastModified: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe(() => {
      this.assignPickerOpen.set(false);
      this.sel.clear();
      this.refreshDeals();
    });
  }

  protected onClearAssignmentBulk(): void {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    const streams = ids.map((sid) =>
      this.dealsService
        .update(Number(sid), {
          assignedTo: '',
          assignedInitials: '',
          dealOwnerId: '',
          lastModified: 'Just now',
        })
        .pipe(take(1)),
    );
    forkJoin(streams).subscribe(() => {
      this.sel.clear();
      this.refreshDeals();
    });
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
    const editId = this.editingNumericId();
    if (
      emailTrim &&
      this.rows().some(
        (r) =>
          r.email.toLowerCase() === emailTrim.toLowerCase() &&
          (editId == null || Number(r.id) !== editId),
      )
    ) {
      const c = this.createForm.get('primaryEmail');
      c?.setErrors({ ...(c.errors ?? {}), duplicate: true });
      c?.markAsTouched();
      return;
    }

    const owner = this.dealOwnerOptions.find((o) => o.id === raw.dealOwner);

    const payload: Omit<DealRow, 'id'> = {
      organizationName: raw.organizationName.trim(),
      employees: raw.employees,
      annualRevenue: parseRevenueInputToNumber(raw.annualRevenue),
      website: raw.website.trim(),
      territory: raw.territory,
      industry: raw.industry,
      salutation: raw.salutation,
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: emailTrim,
      mobile: raw.primaryMobile.trim(),
      gender: raw.gender,
      status: raw.status,
      dealOwnerId: raw.dealOwner,
      assignedTo: owner?.label ?? '',
      assignedInitials: owner?.initials ?? '',
      lastModified: 'Just now',
    };

    const done = () => {
      this.sel.clear();
      this.refreshDeals();
      this.closeForm();
    };

    if (editId != null) {
      this.dealsService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe(() => done());
    } else {
      this.dealsService
        .create(payload)
        .pipe(take(1))
        .subscribe(() => done());
    }
  }

  protected deleteDeal(row: DealRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.dealsService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.sel.removeId(row.id);
        this.refreshDeals();
      });
  }

  /** Table display only (not persisted). */
  protected formatDealRevenue(value: number): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '₹ 0';
    return `₹ ${value.toLocaleString('en-IN')}`;
  }

  protected statusClass(status: DealPipelineStatus): string {
    switch (status) {
      case 'Closed Won':
        return 'deals__tag deals__tag--ok';
      case 'Closed Lost':
        return 'deals__tag deals__tag--bad';
      case 'Demo/Making':
        return 'deals__tag deals__tag--demo';
      case 'Negotiation':
      case 'Proposal':
        return 'deals__tag deals__tag--accent';
      default:
        return 'deals__tag deals__tag--muted';
    }
  }
}

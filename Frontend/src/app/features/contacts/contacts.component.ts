import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { ContactsService } from '../../core/services/contacts.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { createIdSelection } from '../../shared/utils/selection-manager';

export interface ContactRow {
  id: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  organization: string;
  /** Backend FK when returned by API. */
  organizationId?: string;
  /** `users.id` who created the contact (RBAC own-scope). */
  createdBy?: string;
  designation: string;
  address: string;
  lastModified: string;
}

@Component({
  selector: 'app-contacts',
  imports: [ReactiveFormsModule, RouterLink, CrmSelectionBarComponent],
  templateUrl: './contacts.component.html',
  styleUrl: './contacts.component.scss',
})
export class ContactsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly contactsService = inject(ContactsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;
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

  protected readonly rows = signal<ContactRow[]>([]);

  constructor() {
    this.refreshContacts();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'contact') return;
      this.refreshContacts();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshContacts(): void {
    this.userScope
      .listContacts()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
  );

  protected readonly createForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    gender: [''],
    companyName: ['', Validators.maxLength(200)],
    designation: ['', Validators.maxLength(120)],
    address: [''],
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
      firstName: '',
      lastName: '',
      email: '',
      mobile: '',
      gender: '',
      companyName: '',
      designation: '',
      address: '',
    });
    this.createForm.markAsUntouched();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.createForm.reset({
      firstName: '',
      lastName: '',
      email: '',
      mobile: '',
      gender: '',
      companyName: '',
      designation: '',
      address: '',
    });
    this.createForm.markAsUntouched();
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.contactsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        this.createForm.patchValue({
          firstName: row.firstName ?? '',
          lastName: row.lastName ?? '',
          email: row.email,
          mobile: row.phone === '—' ? '' : row.phone,
          gender: row.gender ?? '',
          companyName: row.organization ?? '',
          designation: row.designation ?? '',
          address: row.address ?? '',
         
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
    forkJoin(ids.map((sid) => this.contactsService.delete(Number(sid)).pipe(take(1)))).subscribe({
      next: () => {
        this.sel.clear();
        this.refreshContacts();
        const n = ids.length;
        this.toast.success(n === 1 ? 'Contact deleted.' : `${n} contacts deleted.`);
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected clearEmailDuplicate(): void {
    const c = this.createForm.get('email');
    const errs = c?.errors;
    if (!c || !errs?.['duplicate']) return;
    const next = { ...errs };
    delete next['duplicate'];
    c.setErrors(Object.keys(next).length ? next : null);
  }

  protected fieldInvalid(name: string): boolean {
    const ctrl = this.createForm.get(name);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected submitContact(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const emailLower = raw.email.trim().toLowerCase();
    const emailCtrl = this.createForm.get('email');
    const editId = this.editingNumericId();
    if (
      this.rows().some(
        (r) =>
          r.email.toLowerCase() === emailLower && (editId == null || Number(r.id) !== editId),
      )
    ) {
      emailCtrl?.setErrors({ ...(emailCtrl.errors ?? {}), duplicate: true });
      emailCtrl?.markAsTouched();
      return;
    }

    const payload: Omit<ContactRow, 'id'> = {
      salutation: '',
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim(),
      phone: raw.mobile.trim(),
      gender: raw.gender,
      organization: raw.companyName.trim(),
      designation: raw.designation.trim(),
      address: raw.address,
      lastModified: 'Just now',
    
    };

    const done = () => {
      this.sel.clear();
      this.refreshContacts();
      this.closeForm();
    };

    if (editId != null) {
      this.contactsService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Contact updated.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    } else {
      this.contactsService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Contact created.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    }
  }

  protected deleteContact(row: ContactRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.contactsService
      .delete(id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.sel.removeId(row.id);
          this.refreshContacts();
          this.toast.success('Contact deleted.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  /** Primary label in the contacts grid (matches detail headline when possible). */
  protected contactLabel(row: ContactRow): string {
    const combined = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(' ');
    if (combined) return combined;
    const local = row.email?.split('@')[0]?.trim();
    return local || row.email || 'Contact';
  }
}

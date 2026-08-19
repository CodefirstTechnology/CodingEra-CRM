import { Component, computed, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { ContactsService } from '../../core/services/contacts.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { PermissionService } from '../../core/services/permission.service';
import { ToastService } from '../../core/toast/toast.service';
import { CrmPaginationFooterComponent } from '../../shared/components/crm-pagination-footer/crm-pagination-footer.component';
import { createClientTablePagination } from '../../shared/utils/crm-table-pagination.util';
import { createIdSelection } from '../../shared/utils/selection-manager';
import { getCrmIntlTelInitOptions, crmIntlTelInputProps } from '../../shared/config/crm-intl-tel.config';
import { intlTelMobileErrorMessage } from '../../shared/utils/intl-tel.util';
import { IntlTelDisplayPipe } from '../../shared/pipes/intl-tel-display.pipe';
import { IntlTelInputComponent } from 'intl-tel-input/angularWithUtils';
import { TextFormatter } from '../../shared/utils/text-normalizer';

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
  imports: [ReactiveFormsModule, RouterLink, IntlTelInputComponent, IntlTelDisplayPipe, CrmPaginationFooterComponent, NgComponentOutlet],
  templateUrl: './contacts.component.html',
  styleUrl: './contacts.component.scss',
})
export class ContactsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly contactsService = inject(ContactsService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected canDeleteContacts(): boolean {
    return this.permissions.has('contacts.delete');
  }

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);

  protected readonly importModalOpen = signal(false);
  protected readonly importModalLazyComponent = signal<any | null>(null);

  protected readonly genderOptions = ['', 'Male', 'Female', 'Other', 'Prefer not to say'] as const;

  protected readonly rows = signal<ContactRow[]>([]);
  protected readonly searchQuery = signal('');

  protected readonly filtered = computed(() => {
    const q = TextFormatter.search(this.searchQuery());
    return this.rows().filter((row) => {
      if (!q) return true;
      const label = this.contactLabel(row).toLowerCase();
      return (
        label.includes(q) ||
        row.firstName.toLowerCase().includes(q) ||
        row.lastName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.phone?.toLowerCase().includes(q) ?? false) ||
        row.organization.toLowerCase().includes(q) ||
        (row.designation?.toLowerCase().includes(q) ?? false) ||
        (row.address?.toLowerCase().includes(q) ?? false) ||
        (row.gender?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  protected readonly tablePagination = createClientTablePagination(this.filtered);

  protected hasActiveFilters(): boolean {
    return this.searchQuery().trim().length > 0;
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
    this.tablePagination.resetPage();
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.tablePagination.resetPage();
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.tablePagination.resetPage();
  }

  constructor() {
    this.refreshContacts();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'contact') return;
      this.refreshContacts();
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

  private refreshContacts(): void {
    this.userScope
      .listContacts()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.filtered().map((r) => r.id)),
  );

  protected readonly createForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.email, Validators.maxLength(160)]],
    mobile: ['', Validators.required],
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
    this.sel.toggleSelectAll(this.filtered().map((r) => r.id));
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

  private readonly importModalRequestClose = (): void => this.closeImportModal();

  private readonly importModalRequestImportCompleted = (value: unknown): void =>
    this.onContactsImportCompleted(value);

  protected openImportModal(): void {
    this.importModalOpen.set(true);
    if (!this.importModalLazyComponent()) {
      void import('./contacts-import-modal-lazy.component').then((m) => {
        this.importModalLazyComponent.set(m.ContactsImportModalLazyComponent);
      });
    }
  }

  protected closeImportModal(): void {
    this.importModalOpen.set(false);
  }

  protected onContactsImportCompleted(result: any): void {
    this.importModalOpen.set(false);
    this.refreshContacts();
  }

  protected importModalOutletInputs(): Record<string, unknown> {
    return {
      open: this.importModalOpen(),
      requestClose: this.importModalRequestClose,
      requestImportCompleted: this.importModalRequestImportCompleted,
    };
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

  protected readonly intlTelInitOptions = getCrmIntlTelInitOptions();
  protected readonly intlTelMobileInputProps = crmIntlTelInputProps();
  protected intlTelMobileError = intlTelMobileErrorMessage;

  protected submitContact(): void {
    TextFormatter.form(this.createForm);
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    const raw = this.createForm.getRawValue();
    const emailLower = raw.email.trim().toLowerCase();
    const emailCtrl = this.createForm.get('email');
    const editId = this.editingNumericId();
    if (
      emailLower &&
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
    if (!this.canDeleteContacts()) {
      this.toast.error('You do not have permission to perform this action.');
      return;
    }
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

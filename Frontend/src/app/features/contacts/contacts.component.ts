import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { ContactsService } from '../../core/services/contacts.service';

export interface ContactRow {
  id: string;
  email: string;
  phone: string;
  organization: string;
  lastModified: string;
}

@Component({
  selector: 'app-contacts',
  imports: [ReactiveFormsModule],
  templateUrl: './contacts.component.html',
  styleUrl: './contacts.component.scss',
})
export class ContactsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly contactsService = inject(ContactsService);

  protected readonly formOpen = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());

  protected readonly salutationOptions = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;
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
  }

  private refreshContacts(): void {
    this.contactsService
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
    salutation: [''],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    mobile: ['', [Validators.maxLength(40)]],
    gender: [''],
    companyName: ['', [Validators.required, Validators.maxLength(200)]],
    designation: ['', Validators.maxLength(120)],
    address: [''],
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
      salutation: '',
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
    this.createForm.reset({
      salutation: '',
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
    if (this.rows().some((r) => r.email.toLowerCase() === emailLower)) {
      emailCtrl?.setErrors({ ...(emailCtrl.errors ?? {}), duplicate: true });
      emailCtrl?.markAsTouched();
      return;
    }

    const payload: Omit<ContactRow, 'id'> = {
      email: raw.email.trim(),
      phone: raw.mobile.trim() || '—',
      organization: raw.companyName.trim(),
      lastModified: 'Just now',
    };

    this.contactsService
      .create(payload)
      .pipe(take(1))
      .subscribe(() => {
        this.refreshContacts();
        this.closeForm();
      });
  }

  protected deleteContact(row: ContactRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.contactsService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.selectedIds.update((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        this.refreshContacts();
      });
  }
}

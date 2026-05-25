import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { isAdmin } from '../../core/auth/auth-role.util';
import { AuthService } from '../../core/auth/auth.service';
import { AdminUsersService, type AdminUserRow } from '../../core/services/admin-users.service';
import { ToastService } from '../../core/toast/toast.service';
import { optionalPhoneValidator } from '../../shared/validators/crm-validators';
import { passwordsMatchValidator } from '../auth/passwords-match.validator';

type SettingsNavGroup = { title: string; items: readonly string[] };

const ADMIN_ONLY_ITEMS = new Set(['Users', 'Invite User']);

@Component({
  selector: 'app-advanced-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './advanced-settings.component.html',
  styleUrl: './advanced-settings.component.scss',
})
export class AdvancedSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly toast = inject(ToastService);

  protected readonly isAdminViewer = computed(() => isAdmin(this.auth.user()));
  protected readonly activeItem = signal('Profile');
  protected readonly selectedRoleFilter = signal('All');
  protected readonly usersSearchQuery = signal('');
  protected readonly usersFromApi = signal<AdminUserRow[]>([]);
  protected readonly usersLoading = signal(false);
  protected readonly usersError = signal<string | null>(null);
  protected readonly inviteSubmitting = signal(false);
  protected readonly inviteFormError = signal<string | null>(null);
  protected readonly roleFilters = ['All', 'Admin', 'User'] as const;

  protected readonly inviteUserForm = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(80)]],
      lastName: ['', [Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
      confirmPassword: ['', Validators.required],
      phone: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
    },
    { validators: [passwordsMatchValidator()] },
  );

  private readonly allNavGroups: readonly SettingsNavGroup[] = [
    { title: 'Profile', items: ['Profile'] },
    {
      title: 'System Configuration',
      items: ['Forecasting', 'Currency & Exchange', 'Brand Settings'],
    },
    { title: 'User Management', items: ['Users', 'Invite User'] },
    { title: 'Email Settings', items: ['Email Accounts', 'Email Templates'] },
    { title: 'Automation & Rules', items: ['Assignment rules'] },
    { title: 'Customization', items: ['Home Actions'] },
    { title: 'Integrations', items: ['Telephony', 'ERPNext'] },
  ];

  protected readonly leftNav = computed(() =>
    this.isAdminViewer()
      ? this.allNavGroups
      : this.allNavGroups.filter((group) => group.title !== 'User Management'),
  );

  protected reloadUsersFromApi(): void {
    if (!this.isAdminViewer()) return;

    this.usersLoading.set(true);
    this.usersError.set(null);
    this.adminUsers.listUsers(this.auth.token()).subscribe({
      next: (rows) => {
        this.usersFromApi.set(rows);
        this.usersLoading.set(false);
      },
      error: () => {
        this.usersLoading.set(false);
        this.usersError.set('Could not load users. Check that the API is running and you are signed in.');
      },
    });
  }

  protected readonly filteredUsers = computed(() => {
    const role = this.selectedRoleFilter();
    const q = this.usersSearchQuery().trim().toLowerCase();
    let all = this.usersFromApi();
    if (role !== 'All') {
      all = all.filter((u) => u.role === role);
    }
    if (q) {
      all = all.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    return all;
  });

  protected onUsersSearch(ev: Event): void {
    this.usersSearchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected setActiveItem(item: string): void {
    if (ADMIN_ONLY_ITEMS.has(item) && !this.isAdminViewer()) {
      this.toast.error('Only admins can manage users.');
      this.activeItem.set('Profile');
      return;
    }

    this.activeItem.set(item);
    if (item === 'Users') {
      this.reloadUsersFromApi();
    }
    if (item === 'Invite User') {
      this.inviteFormError.set(null);
    }
  }

  protected setRoleFilter(ev: Event): void {
    this.selectedRoleFilter.set((ev.target as HTMLSelectElement).value);
  }

  protected openInviteUser(): void {
    this.setActiveItem('Invite User');
  }

  protected submitInviteUser(): void {
    if (!this.isAdminViewer()) {
      this.toast.error('Only admins can invite users.');
      return;
    }

    this.inviteFormError.set(null);
    this.inviteUserForm.markAllAsTouched();
    if (this.inviteUserForm.invalid) return;

    const v = this.inviteUserForm.getRawValue();
    const firstName = v.firstName.trim();
    const lastName = v.lastName.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    this.inviteSubmitting.set(true);
    this.adminUsers
      .createUser(this.auth.token(), {
        fullName,
        email: v.email.trim(),
        password: v.password,
        phone: v.phone.trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.inviteSubmitting.set(false);
          if (res.ok) {
            this.toast.success('User created successfully.');
            this.inviteUserForm.reset();
            this.reloadUsersFromApi();
            return;
          }
          const msg = res.error ?? 'Could not create user.';
          this.inviteFormError.set(msg);
          this.toast.error(msg);
        },
        error: () => {
          this.inviteSubmitting.set(false);
          const msg = 'Something went wrong. Please try again.';
          this.inviteFormError.set(msg);
          this.toast.error(msg);
        },
      });
  }

  protected inviteFieldInvalid(
    name: 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword' | 'phone',
  ): boolean {
    const c = this.inviteUserForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected inviteConfirmMismatch(): boolean {
    return (
      this.inviteUserForm.hasError('passwordMismatch') &&
      (!!this.inviteUserForm.get('confirmPassword')?.dirty ||
        !!this.inviteUserForm.get('confirmPassword')?.touched)
    );
  }

  protected profile(): { name: string; email: string; firstName: string; lastName: string } {
    const user = this.auth.user();
    const name = user?.name?.trim() || 'User';
    const email = user?.email?.trim() || 'user@example.com';
    const [firstName, ...rest] = name.split(/\s+/);
    return {
      name,
      email,
      firstName: firstName || 'User',
      lastName: rest.join(' ') || '',
    };
  }

  protected avatarInitial(): string {
    const p = this.profile();
    return p.firstName.charAt(0).toUpperCase();
  }

  protected userInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase();
  }
}

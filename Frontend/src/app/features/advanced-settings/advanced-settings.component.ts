import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { isAdmin } from '../../core/auth/auth-role.util';
import { AuthService } from '../../core/auth/auth.service';
import { canManageSettings, hasPermission } from '../../core/auth/permission.util';
import type { RoleListItem } from '../../core/auth/permission.models';
import { AdminUsersService, type AdminUserRow } from '../../core/services/admin-users.service';
import { PermissionService } from '../../core/services/permission.service';
import { RbacService } from '../../core/services/rbac.service';
import { ToastService } from '../../core/toast/toast.service';
import { optionalPhoneValidator } from '../../shared/validators/crm-validators';
import { MasterFormsComponent } from '../settings/master-forms/master-forms.component';
import { RoleManagementComponent } from '../settings/role-management/role-management.component';
import { passwordsMatchValidator } from '../auth/passwords-match.validator';
import { CompanyProfileSettingsComponent } from './company-profile-settings/company-profile-settings.component';
import { ItemMasterSettingsComponent } from './item-master/item-master-settings.component';
import { UserTargetSettingsComponent } from './user-targets/user-target-settings.component';
import { LeadSyncManagementSettingsComponent } from './lead-sync-management/lead-sync-management-settings.component';
import { DeleteUserModalComponent } from './delete-user-modal.component';
import { EditUserModalComponent } from './edit-user-modal.component';
import { ChangePasswordModalComponent } from './change-password-modal.component';

type SettingsNavGroup = { title: string; items: readonly string[] };

const PERMISSION_GATED_ITEMS: Record<string, readonly string[]> = {
  Users: ['users.view', 'settings.manage'],
  'Invite User': ['users.create', 'settings.manage'],
  Roles: ['roles.view', 'roles.manage', 'settings.manage'],
  Permissions: ['roles.view', 'roles.manage', 'settings.manage'],
  'Master Forms': ['settings.manage'],
  'Company Profile': ['settings.manage'],
  'Item Master': ['items.view', 'items.manage', 'settings.manage'],
  'User Targets': ['user_targets.view', 'user_targets.manage', 'settings.manage'],
  'Lead Sync Management': ['settings.manage'],
};

@Component({
  selector: 'app-advanced-settings',
  imports: [
    ReactiveFormsModule,
    CompanyProfileSettingsComponent,
    ItemMasterSettingsComponent,
    UserTargetSettingsComponent,
    LeadSyncManagementSettingsComponent,
    DeleteUserModalComponent,
    EditUserModalComponent,
    ChangePasswordModalComponent,
    MasterFormsComponent,
    RoleManagementComponent,
  ],
  templateUrl: './advanced-settings.component.html',
  styleUrl: './advanced-settings.component.scss',
})
export class AdvancedSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly rbac = inject(RbacService);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly isAdminViewer = computed(() => canManageSettings(this.auth.user()) || isAdmin(this.auth.user()));
  protected readonly activeItem = signal('Profile');
  protected readonly selectedRoleFilter = signal('All');
  protected readonly usersSearchQuery = signal('');
  protected readonly usersFromApi = signal<AdminUserRow[]>([]);
  protected readonly rolesFromApi = signal<RoleListItem[]>([]);
  protected readonly usersLoading = signal(false);
  protected readonly usersError = signal<string | null>(null);
  protected readonly inviteSubmitting = signal(false);
  protected readonly inviteFormError = signal<string | null>(null);
  protected readonly deleteModalOpen = signal(false);
  protected readonly deleteTarget = signal<AdminUserRow | null>(null);
  protected readonly editModalOpen = signal(false);
  protected readonly editTarget = signal<AdminUserRow | null>(null);
  protected readonly changePasswordModalOpen = signal(false);

  protected readonly roleFilters = computed(() => {
    const roles = this.rolesFromApi().map((r) => r.name);
    return ['All', ...roles];
  });

  protected readonly inviteUserForm = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(80)]],
      lastName: ['', [Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(200)]],
      confirmPassword: ['', Validators.required],
      phone: ['', [Validators.maxLength(40), optionalPhoneValidator()]],
      roleId: [0, [Validators.required, Validators.min(1)]],
    },
    { validators: [passwordsMatchValidator()] },
  );

  private readonly allNavGroups: readonly SettingsNavGroup[] = [
    { title: 'Profile', items: ['Profile'] },
    {
      title: 'System Configuration',
      items: ['Master Forms', 'Company Profile', 'Item Master', 'User Targets', 'Lead Sync Management'],
    },
    {
      title: 'Access Control',
      items: ['Roles', 'Permissions'],
    },
    { title: 'User Management', items: ['Users', 'Invite User'] },
  ];

  protected readonly leftNav = computed(() => {
    const user = this.auth.user();
    return this.allNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => this.canAccessNavItem(user, item)),
      }))
      .filter((group) => group.items.length > 0);
  });

  ngOnInit(): void {
    this.auth.refreshSessionProfile();
    if (this.canLoadRoles()) {
      this.loadRoles();
    }

    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      if (tab === 'User Targets') {
        const user = this.auth.user();
        if (this.canAccessNavItem(user, 'User Targets')) {
          this.activeItem.set('User Targets');
        }
      }
    });
  }

  private canLoadRoles(): boolean {
    return (
      isAdmin(this.auth.user()) ||
      this.permissions.hasAny([
        'roles.view',
        'roles.manage',
        'settings.manage',
        'users.view',
        'users.create',
      ])
    );
  }

  private canAccessNavItem(user: ReturnType<typeof this.auth.user>, item: string): boolean {
    if (item === 'Lead Sync Management') {
      return isAdmin(user) || this.permissions.has('settings.manage');
    }
    const required = PERMISSION_GATED_ITEMS[item];
    if (!required) return true;
    return this.permissions.hasAny([...required]) || isAdmin(user);
  }

  protected loadRoles(): void {
    if (!this.canLoadRoles()) return;

    this.rbac.listRoles(this.auth.token(), { activeOnly: true }).subscribe({
      next: (rows) => this.rolesFromApi.set(rows),
      error: () => {},
    });
  }

  protected reloadUsersFromApi(): void {
    if (!this.permissions.hasAny(['users.view', 'settings.manage'])) return;

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
    if (!this.canAccessNavItem(this.auth.user(), item)) {
      this.toast.error('You do not have permission to access this section.');
      this.activeItem.set('Profile');
      return;
    }

    this.activeItem.set(item);
    if (item === 'Profile') {
      this.auth.refreshSessionProfile();
    }
    if (item === 'Users') {
      this.reloadUsersFromApi();
    }
    if (item === 'Invite User') {
      this.inviteFormError.set(null);
      this.loadRoles();
    }
    if (item === 'Roles' || item === 'Permissions') {
      this.loadRoles();
    }
  }

  protected setRoleFilter(ev: Event): void {
    this.selectedRoleFilter.set((ev.target as HTMLSelectElement).value);
  }

  protected openInviteUser(): void {
    this.setActiveItem('Invite User');
  }

  protected submitInviteUser(): void {
    if (!this.permissions.hasAny(['users.create', 'settings.manage'])) {
      this.toast.error('You do not have permission to invite users.');
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
        roleId: v.roleId,
      })
      .subscribe({
        next: (res) => {
          this.inviteSubmitting.set(false);
          if (res.ok) {
            this.toast.success('User created successfully.');
            this.inviteUserForm.reset({ roleId: 0 });
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
    name: 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword' | 'phone' | 'roleId',
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

  protected readonly profile = computed(() => {
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
  });

  protected readonly avatarInitial = computed(() => {
    const p = this.profile();
    return p.firstName.charAt(0).toUpperCase();
  });

  protected userInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase();
  }

  protected canDeleteUser(user: AdminUserRow): boolean {
    if (!this.permissions.hasAny(['users.delete', 'settings.manage'])) return false;
    const sessionId = this.auth.user()?.id?.trim();
    if (!sessionId) return true;
    return sessionId !== user.id.trim();
  }

  protected canEditUser(): boolean {
    return this.permissions.hasAny(['users.edit', 'settings.manage']);
  }

  protected openChangePassword(): void {
    this.changePasswordModalOpen.set(true);
  }

  protected closeChangePasswordModal(): void {
    this.changePasswordModalOpen.set(false);
  }

  protected onPasswordChanged(): void {
    this.closeChangePasswordModal();
  }

  protected openDeleteUser(user: AdminUserRow): void {
    if (!this.canDeleteUser(user)) {
      this.toast.error('You cannot delete your own account.');
      return;
    }
    this.deleteTarget.set(user);
    this.deleteModalOpen.set(true);
  }

  protected openEditUser(user: AdminUserRow): void {
    this.editTarget.set(user);
    this.editModalOpen.set(true);
  }

  protected closeDeleteUserModal(): void {
    this.deleteModalOpen.set(false);
    this.deleteTarget.set(null);
  }

  protected closeEditUserModal(): void {
    this.editModalOpen.set(false);
    this.editTarget.set(null);
  }

  protected onUserDeleted(): void {
    this.closeDeleteUserModal();
    this.reloadUsersFromApi();
  }

  protected onUserSaved(): void {
    const edited = this.editTarget();
    const sessionId = this.auth.user()?.id?.trim();
    this.closeEditUserModal();
    this.reloadUsersFromApi();
    if (edited && sessionId && edited.id.trim() === sessionId) {
      this.auth.refreshSessionProfile();
    }
  }
}

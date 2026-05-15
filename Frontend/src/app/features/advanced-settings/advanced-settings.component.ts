import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminUsersService, type AdminUserRow } from '../../core/services/admin-users.service';

@Component({
  selector: 'app-advanced-settings',
  imports: [],
  templateUrl: './advanced-settings.component.html',
  styleUrl: './advanced-settings.component.scss',
})
export class AdvancedSettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  protected readonly activeItem = signal('Profile');
  protected readonly selectedRoleFilter = signal('All');
  protected readonly addExistingOpen = signal(false);
  protected readonly inviteNewOpen = signal(false);
  protected readonly addExistingRole = signal('Sales User');
  protected readonly inviteRole = signal('Sales User');
  protected readonly inviteEmailsInput = signal('');
  protected readonly newMenuOpen = signal(false);
  protected readonly usersSearchQuery = signal('');
  protected readonly usersFromApi = signal<AdminUserRow[]>([]);
  /** Rows added locally via invite (not persisted until API exists). */
  protected readonly localInviteAdds = signal<AdminUserRow[]>([]);
  protected readonly usersLoading = signal(false);
  protected readonly usersError = signal<string | null>(null);
  protected readonly roleFilters = ['All', 'Admin', 'Manager', 'Sales User'] as const;

  protected readonly leftNav = [
    {
      title: 'Profile',
      items: ['Profile'],
    },
    {
      title: 'System Configuration',
      items: ['Forecasting', 'Currency & Exchange', 'Brand Settings'],
    },
    {
      title: 'User Management',
      items: ['Users', 'Invite User'],
    },
    {
      title: 'Email Settings',
      items: ['Email Accounts', 'Email Templates'],
    },
    {
      title: 'Automation & Rules',
      items: ['Assignment rules'],
    },
    {
      title: 'Customization',
      items: ['Home Actions'],
    },
    {
      title: 'Integrations',
      items: ['Telephony', 'ERPNext'],
    },
  ];

  protected reloadUsersFromApi(): void {
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

  protected readonly allDisplayedUsers = computed(() => [
    ...this.localInviteAdds(),
    ...this.usersFromApi(),
  ]);

  protected readonly filteredUsers = computed(() => {
    const role = this.selectedRoleFilter();
    const q = this.usersSearchQuery().trim().toLowerCase();
    let all = this.allDisplayedUsers();
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

  protected readonly canSendInvites = computed(() => {
    const parsed = this.parseInviteEmails(this.inviteEmailsInput());
    return parsed.length > 0;
  });

  protected onUsersSearch(ev: Event): void {
    this.usersSearchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected setActiveItem(item: string): void {
    this.activeItem.set(item);
    if (item === 'Users') {
      this.reloadUsersFromApi();
    }
  }

  protected setRoleFilter(ev: Event): void {
    this.selectedRoleFilter.set((ev.target as HTMLSelectElement).value);
  }

  protected toggleNewMenu(): void {
    this.newMenuOpen.update((open) => !open);
  }

  protected closeNewMenu(): void {
    this.newMenuOpen.set(false);
  }

  protected selectNewAction(_action: 'add-existing' | 'invite-new'): void {
    this.closeNewMenu();
    if (_action === 'add-existing') {
      this.openAddExistingModal();
      return;
    }
    this.openInviteNewModal();
  }

  protected openAddExistingModal(): void {
    this.addExistingOpen.set(true);
  }

  protected closeAddExistingModal(): void {
    this.addExistingOpen.set(false);
  }

  protected openInviteNewModal(): void {
    this.inviteNewOpen.set(true);
  }

  protected closeInviteNewModal(): void {
    this.inviteNewOpen.set(false);
  }

  protected onAddExistingRoleChange(ev: Event): void {
    this.addExistingRole.set((ev.target as HTMLSelectElement).value);
  }

  protected onInviteRoleChange(ev: Event): void {
    this.inviteRole.set((ev.target as HTMLSelectElement).value);
  }

  protected onInviteEmailsInput(ev: Event): void {
    this.inviteEmailsInput.set((ev.target as HTMLTextAreaElement).value);
  }

  protected sendInvites(): void {
    const emails = this.parseInviteEmails(this.inviteEmailsInput());
    if (emails.length === 0) return;

    const role = this.inviteRole();
    const existing = new Set(
      this.allDisplayedUsers().map((u) => u.email.toLowerCase()),
    );
    const toAdd: AdminUserRow[] = emails
      .filter((email) => !existing.has(email.toLowerCase()))
      .map((email) => ({
        id: `invite-${email}-${Date.now()}`,
        name: this.nameFromEmail(email),
        email,
        role,
      }));

    if (toAdd.length > 0) {
      this.localInviteAdds.update((rows) => [...toAdd, ...rows]);
    }

    this.inviteEmailsInput.set('');
    this.closeInviteNewModal();
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

  private parseInviteEmails(raw: string): string[] {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !!s && emailRe.test(s));
  }

  private nameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? email;
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(ev: MouseEvent): void {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.adv-users__new-wrap')) return;
    this.closeNewMenu();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closeNewMenu();
    this.closeAddExistingModal();
    this.closeInviteNewModal();
  }
}

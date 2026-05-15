import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsPanelService } from '../../core/notifications/notifications-panel.service';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';
import { ThemePanelService } from '../../core/theme/theme-panel.service';

@Component({
  selector: 'app-crm-navbar',
  imports: [],
  templateUrl: './crm-navbar.component.html',
  styleUrl: './crm-navbar.component.scss',
})
export class CrmNavbarComponent {
  private readonly themePanel = inject(ThemePanelService);
  protected readonly profilePanel = inject(ProfilePanelService);
  protected readonly notificationsPanel = inject(NotificationsPanelService);
  protected readonly auth = inject(AuthService);

  protected openTheme(): void {
    this.profilePanel.close();
    this.notificationsPanel.close();
    this.themePanel.toggle();
  }

  protected openProfile(): void {
    this.themePanel.close();
    this.notificationsPanel.close();
    this.profilePanel.toggle();
  }

  protected openNotifications(): void {
    this.themePanel.close();
    this.profilePanel.close();
    this.notificationsPanel.toggle();
  }

  protected notificationBadgeText(): string {
    const c = this.notificationsPanel.unreadCount();
    if (c > 9) return '9+';
    return String(c);
  }

  /** Two-letter badge for the header avatar (name or email local part). */
  protected avatarInitials(): string {
    const u = this.auth.user();
    const name = u?.name?.trim();
    const email = u?.email?.trim() ?? '';

    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (
          parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
        ).toUpperCase();
      }
      const one = parts[0] ?? name;
      if (one.length >= 2) {
        return one.slice(0, 2).toUpperCase();
      }
      return one.charAt(0).toUpperCase();
    }

    const local = email.split('@')[0] ?? email;
    const alnum = local.replace(/[^a-zA-Z0-9]/g, '');
    if (alnum.length >= 2) {
      return alnum.slice(0, 2).toUpperCase();
    }
    if (alnum.length === 1) {
      return alnum.toUpperCase();
    }
    return '?';
  }

  protected profileButtonTitle(): string {
    const u = this.auth.user();
    if (!u) return 'Open profile';
    const bits = [u.name?.trim(), u.email?.trim()].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'Open profile';
  }
}

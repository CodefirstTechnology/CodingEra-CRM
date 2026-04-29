import { Component, inject } from '@angular/core';
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
}

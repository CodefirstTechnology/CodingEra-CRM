import { Component, inject } from '@angular/core';
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

  protected openTheme(): void {
    this.profilePanel.close();
    this.themePanel.toggle();
  }

  protected openProfile(): void {
    this.themePanel.close();
    this.profilePanel.toggle();
  }
}

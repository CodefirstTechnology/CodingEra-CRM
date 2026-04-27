import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';
import { ThemePanelService } from '../../core/theme/theme-panel.service';

@Component({
  selector: 'app-crm-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './crm-sidebar.component.html',
  styleUrl: './crm-sidebar.component.scss',
})
export class CrmSidebarComponent {
  private readonly profilePanel = inject(ProfilePanelService);
  private readonly themePanel = inject(ThemePanelService);

  protected openProfile(): void {
    this.themePanel.close();
    this.profilePanel.toggle();
  }

  protected openSettings(): void {
    this.profilePanel.close();
    this.themePanel.toggle();
  }
}

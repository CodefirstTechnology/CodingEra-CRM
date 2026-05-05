import { Component, inject } from '@angular/core';
import { SidebarCollapseService } from '../../core/layout/sidebar-collapse.service';
import { RouterOutlet } from '@angular/router';
import { CrmNavbarComponent } from '../crm-navbar/crm-navbar.component';
import { CrmSidebarComponent } from '../crm-sidebar/crm-sidebar.component';
import { ThemeSettingsComponent } from '../../features/theme-settings/theme-settings.component';
import { ProfilePanelComponent } from '../../features/profile/profile-panel.component';
import { NotificationsPanelComponent } from '../../features/notifications/notifications-panel.component';
import { CreateEntityFormModalComponent } from '../../features/create-flow/create-entity-form-modal.component';
import { CreatePickerModalComponent } from '../../features/create-flow/create-picker-modal.component';

@Component({
  selector: 'app-crm-shell',
  imports: [
    RouterOutlet,
    CrmNavbarComponent,
    CrmSidebarComponent,
    ThemeSettingsComponent,
    ProfilePanelComponent,
    NotificationsPanelComponent,
    CreatePickerModalComponent,
    CreateEntityFormModalComponent,
  ],
  templateUrl: './crm-shell.component.html',
  styleUrl: './crm-shell.component.scss',
})
export class CrmShellComponent {
  protected readonly sidebarCollapse = inject(SidebarCollapseService);
}

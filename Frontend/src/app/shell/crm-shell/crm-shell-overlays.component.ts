import { Component } from '@angular/core';
import { CreateEntityFormModalComponent } from '../../features/create-flow/create-entity-form-modal.component';
import { CreatePickerModalComponent } from '../../features/create-flow/create-picker-modal.component';
import { NotificationsPanelComponent } from '../../features/notifications/notifications-panel.component';
import { ProfilePanelComponent } from '../../features/profile/profile-panel.component';
import { ThemeSettingsComponent } from '../../features/theme-settings/theme-settings.component';

/** Shell overlays loaded on demand (create flow, notifications, profile, theme). */
@Component({
  selector: 'app-crm-shell-overlays',
  imports: [
    ThemeSettingsComponent,
    ProfilePanelComponent,
    NotificationsPanelComponent,
    CreatePickerModalComponent,
    CreateEntityFormModalComponent,
  ],
  template: `
    <app-theme-settings />
    <app-profile-panel />
    <app-notifications-panel />
    <app-create-picker-modal />
    <app-create-entity-form-modal />
  `,
})
export class CrmShellOverlaysComponent {}

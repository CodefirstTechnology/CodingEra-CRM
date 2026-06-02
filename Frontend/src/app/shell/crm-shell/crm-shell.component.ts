import { NgComponentOutlet } from '@angular/common';
import { Component, effect, inject, signal, Type, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { SidebarCollapseService } from '../../core/layout/sidebar-collapse.service';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';
import { ThemePanelService } from '../../core/theme/theme-panel.service';
import { NotificationsPanelService } from '../../core/notifications/notifications-panel.service';
import { CrmNavbarComponent } from '../crm-navbar/crm-navbar.component';
import { CrmRouteLoadingComponent } from '../crm-route-loading/crm-route-loading.component';
import { CrmSidebarComponent } from '../crm-sidebar/crm-sidebar.component';

@Component({
  selector: 'app-crm-shell',
  imports: [RouterOutlet, CrmNavbarComponent, CrmSidebarComponent, CrmRouteLoadingComponent, NgComponentOutlet],
  templateUrl: './crm-shell.component.html',
  styleUrl: './crm-shell.component.scss',
})
export class CrmShellComponent {
  protected readonly sidebarCollapse = inject(SidebarCollapseService);

  private readonly createFlow = inject(CreateFlowService);
  private readonly notificationsPanel = inject(NotificationsPanelService);
  private readonly profilePanel = inject(ProfilePanelService);
  private readonly themePanel = inject(ThemePanelService);

  protected readonly overlaysComponent = signal<Type<unknown> | null>(null);

  constructor() {
    effect(() => {
      const needsOverlays =
        this.createFlow.pickerOpen() ||
        this.createFlow.formModalOpen() ||
        this.notificationsPanel.open() ||
        this.profilePanel.open() ||
        this.themePanel.open();

      if (!needsOverlays) return;

      untracked(() => this.ensureOverlaysLoaded());
    });
  }

  private ensureOverlaysLoaded(): void {
    if (this.overlaysComponent()) return;
    void import('./crm-shell-overlays.component').then((m) => {
      this.overlaysComponent.set(m.CrmShellOverlaysComponent);
    });
  }
}

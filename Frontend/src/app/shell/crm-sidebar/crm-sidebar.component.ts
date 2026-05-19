import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { isAdmin } from '../../core/auth/auth-role.util';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { SidebarCollapseService } from '../../core/layout/sidebar-collapse.service';

@Component({
  selector: 'app-crm-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './crm-sidebar.component.html',
  styleUrl: './crm-sidebar.component.scss',
})
export class CrmSidebarComponent {
  private readonly auth = inject(AuthService);
  protected readonly sidebarCollapse = inject(SidebarCollapseService);
  private readonly createFlow = inject(CreateFlowService);

  protected readonly showAdminDashboard = computed(() => isAdmin(this.auth.user()));
  protected readonly showUserDashboard = computed(() => !isAdmin(this.auth.user()));

  protected toggleCollapse(): void {
    this.sidebarCollapse.toggle();
  }

  protected openCreateMenu(): void {
    this.createFlow.openPicker();
  }
}

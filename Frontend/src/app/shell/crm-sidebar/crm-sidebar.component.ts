import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { isAdmin } from '../../core/auth/auth-role.util';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { SidebarCollapseService } from '../../core/layout/sidebar-collapse.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-crm-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './crm-sidebar.component.html',
  styleUrl: './crm-sidebar.component.scss',
})
export class CrmSidebarComponent {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  protected readonly sidebarCollapse = inject(SidebarCollapseService);
  private readonly createFlow = inject(CreateFlowService);

  protected readonly showAdminDashboard = computed(
    () => isAdmin(this.auth.user()) || this.permissions.has('settings.manage'),
  );
  protected readonly showUserDashboard = computed(() => !this.showAdminDashboard());

  protected readonly showLeads = computed(() => this.permissions.canViewModule('leads'));
  protected readonly showDeals = computed(() => this.permissions.canViewModule('deals'));
  protected readonly showContacts = computed(() => this.permissions.canViewModule('contacts'));
  protected readonly showOrganizations = computed(() => this.permissions.canViewModule('organizations'));
  protected readonly showNotes = computed(() => this.permissions.canViewModule('notes'));
  protected readonly showTasks = computed(() => this.permissions.canViewModule('tasks'));
  protected readonly showQuotations = computed(() => this.permissions.canViewModule('quotations'));

  protected toggleCollapse(): void {
    this.sidebarCollapse.toggle();
  }

  protected openCreateMenu(): void {
    this.createFlow.openPicker();
  }
}

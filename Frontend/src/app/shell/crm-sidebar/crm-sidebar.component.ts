import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { SidebarCollapseService } from '../../core/layout/sidebar-collapse.service';

@Component({
  selector: 'app-crm-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './crm-sidebar.component.html',
  styleUrl: './crm-sidebar.component.scss',
})
export class CrmSidebarComponent {
  protected readonly sidebarCollapse = inject(SidebarCollapseService);
  private readonly createFlow = inject(CreateFlowService);

  protected toggleCollapse(): void {
    this.sidebarCollapse.toggle();
  }

  protected openCreateMenu(): void {
    this.createFlow.openPicker();
  }
}

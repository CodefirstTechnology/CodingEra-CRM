import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-crm-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './crm-sidebar.component.html',
  styleUrl: './crm-sidebar.component.scss',
})
export class CrmSidebarComponent {}

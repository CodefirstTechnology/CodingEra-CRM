import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Hosts nested `/dashboard/*` routes (home + IndiaMART leads) inside the CRM shell. */
@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class DashboardShellComponent {}

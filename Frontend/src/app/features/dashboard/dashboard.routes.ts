import { Routes } from '@angular/router';
import { indiamartLeadsLegacyRedirectGuard } from '../../core/routing/indiamart-lead-feature.guard';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard-shell.component').then((m) => m.DashboardShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'employee/:userId',
        loadComponent: () =>
          import('./employee-performance/employee-performance.component').then(
            (m) => m.EmployeePerformanceComponent,
          ),
      },
      {
        path: 'stuck-pipeline',
        loadComponent: () =>
          import('../stuck-pipeline/stuck-pipeline.component').then(
            (m) => m.StuckPipelineComponent,
          ),
      },
      {
        path: 'indiamart-leads',
        pathMatch: 'full',
        canActivate: [indiamartLeadsLegacyRedirectGuard],
        loadComponent: () =>
          import('./indiamart-leads-legacy-placeholder.component').then(
            (m) => m.IndiamartLeadsLegacyPlaceholderComponent,
          ),
      },
    ],
  },
];

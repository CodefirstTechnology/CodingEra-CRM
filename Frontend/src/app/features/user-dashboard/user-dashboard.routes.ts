import { Routes } from '@angular/router';

export const USER_DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./user-dashboard.component').then((m) => m.UserDashboardComponent),
  },
  {
    path: 'stuck-pipeline',
    loadComponent: () =>
      import('../stuck-pipeline/stuck-pipeline.component').then(
        (m) => m.StuckPipelineComponent,
      ),
  },
];

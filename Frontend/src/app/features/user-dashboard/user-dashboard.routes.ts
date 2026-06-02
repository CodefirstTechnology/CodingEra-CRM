import { Routes } from '@angular/router';

export const USER_DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./user-dashboard.component').then((m) => m.UserDashboardComponent),
  },
];

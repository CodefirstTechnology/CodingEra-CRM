import { Routes } from '@angular/router';

export const ORGANIZATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./organizations.component').then((m) => m.OrganizationsComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./organization-detail.component').then((m) => m.OrganizationDetailComponent),
  },
];

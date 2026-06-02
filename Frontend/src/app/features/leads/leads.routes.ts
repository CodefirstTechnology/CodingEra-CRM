import { Routes } from '@angular/router';

export const LEADS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./leads.component').then((m) => m.LeadsComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./lead-detail.component').then((m) => m.LeadDetailComponent),
  },
];

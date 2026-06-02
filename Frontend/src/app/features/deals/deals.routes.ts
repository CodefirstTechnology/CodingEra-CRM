import { Routes } from '@angular/router';

export const DEALS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./deals.component').then((m) => m.DealsComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./deal-detail.component').then((m) => m.DealDetailComponent),
  },
];

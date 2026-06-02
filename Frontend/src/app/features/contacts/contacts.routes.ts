import { Routes } from '@angular/router';

export const CONTACTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./contacts.component').then((m) => m.ContactsComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./contact-detail.component').then((m) => m.ContactDetailComponent),
  },
];

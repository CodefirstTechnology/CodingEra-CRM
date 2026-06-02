import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  { path: 'register', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'advanced-settings',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./features/advanced-settings/advanced-settings.component').then(
        (m) => m.AdvancedSettingsComponent,
      ),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./shell/crm-shell/crm-shell.component').then((m) => m.CrmShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./core/routing/home-redirect.component').then((m) => m.HomeRedirectComponent),
      },
      {
        path: 'dashboard',
        canMatch: [roleGuard],
        data: { roles: ['admin'] },
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'user-dashboard',
        canMatch: [roleGuard],
        data: { roles: ['user'] },
        loadChildren: () =>
          import('./features/user-dashboard/user-dashboard.routes').then(
            (m) => m.USER_DASHBOARD_ROUTES,
          ),
      },
      {
        path: 'leads',
        data: { preload: true },
        loadChildren: () => import('./features/leads/leads.routes').then((m) => m.LEADS_ROUTES),
      },
      {
        path: 'deals',
        data: { preload: true },
        loadChildren: () => import('./features/deals/deals.routes').then((m) => m.DEALS_ROUTES),
      },
      {
        path: 'contacts',
        data: { preload: true },
        loadChildren: () =>
          import('./features/contacts/contacts.routes').then((m) => m.CONTACTS_ROUTES),
      },
      {
        path: 'organizations',
        data: { preload: true },
        loadChildren: () =>
          import('./features/organizations/organizations.routes').then((m) => m.ORGANIZATIONS_ROUTES),
      },
      {
        path: 'tasks',
        data: { preload: true },
        loadChildren: () => import('./features/tasks/tasks.routes').then((m) => m.TASKS_ROUTES),
      },
      {
        path: 'notes',
        loadChildren: () => import('./features/notes/notes.routes').then((m) => m.NOTES_ROUTES),
      },
      {
        path: 'help',
        loadChildren: () => import('./features/help/help.routes').then((m) => m.HELP_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

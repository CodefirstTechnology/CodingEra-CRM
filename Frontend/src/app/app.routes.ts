import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
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
        path: 'dashboard/stuck-pipeline',
        loadComponent: () =>
          import('./features/stuck-pipeline/stuck-pipeline.component').then(
            (m) => m.StuckPipelineComponent,
          ),
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
        canMatch: [permissionGuard],
        data: { preload: true, permissions: ['leads.view'] },
        loadChildren: () => import('./features/leads/leads.routes').then((m) => m.LEADS_ROUTES),
      },
      {
        path: 'deals',
        canMatch: [permissionGuard],
        data: { preload: true, permissions: ['deals.view'] },
        loadChildren: () => import('./features/deals/deals.routes').then((m) => m.DEALS_ROUTES),
      },
      {
        path: 'contacts',
        canMatch: [permissionGuard],
        data: { preload: true, permissions: ['contacts.view'] },
        loadChildren: () =>
          import('./features/contacts/contacts.routes').then((m) => m.CONTACTS_ROUTES),
      },
      {
        path: 'organizations',
        canMatch: [permissionGuard],
        data: { preload: true, permissions: ['organizations.view'] },
        loadChildren: () =>
          import('./features/organizations/organizations.routes').then((m) => m.ORGANIZATIONS_ROUTES),
      },
      {
        path: 'tasks',
        canMatch: [permissionGuard],
        data: { preload: true, permissions: ['tasks.view'] },
        loadChildren: () => import('./features/tasks/tasks.routes').then((m) => m.TASKS_ROUTES),
      },
      {
        path: 'notes',
        canMatch: [permissionGuard],
        data: { permissions: ['notes.view'] },
        loadChildren: () => import('./features/notes/notes.routes').then((m) => m.NOTES_ROUTES),
      },
      {
        path: 'quotations',
        canMatch: [permissionGuard],
        data: { permissions: ['quotations.view'] },
        loadChildren: () =>
          import('./features/quotations/quotations.module').then((m) => m.QuotationsModule),
      },
      {
        path: 'help',
        loadChildren: () => import('./features/help/help.routes').then((m) => m.HELP_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

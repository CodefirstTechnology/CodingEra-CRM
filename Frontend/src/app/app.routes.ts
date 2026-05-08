import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { CrmShellComponent } from './shell/crm-shell/crm-shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
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
    component: CrmShellComponent,
    canMatch: [authGuard],
    children: [
      {
        path: '',
        loadChildren: () =>
          import('./features/dashboard/dashboard.module').then((m) => m.DashboardModule),
      },
      {
        path: 'leads',
        loadChildren: () => import('./features/leads/leads.module').then((m) => m.LeadsModule),
      },
      {
        path: 'deals',
        loadChildren: () => import('./features/deals/deals.module').then((m) => m.DealsModule),
      },
      {
        path: 'contacts',
        loadChildren: () =>
          import('./features/contacts/contacts.module').then((m) => m.ContactsModule),
      },
      {
        path: 'organizations',
        loadChildren: () =>
          import('./features/organizations/organizations.module').then((m) => m.OrganizationsModule),
      },
      {
        path: 'tasks',
        loadChildren: () => import('./features/tasks/tasks.module').then((m) => m.TasksModule),
      },
      {
        path: 'notes',
        loadChildren: () => import('./features/notes/notes.module').then((m) => m.NotesModule),
      },
      {
        path: 'call-logs',
        loadChildren: () =>
          import('./features/call-logs/call-logs.module').then((m) => m.CallLogsModule),
      },
      {
        path: 'help',
        loadChildren: () => import('./features/help/help.module').then((m) => m.HelpModule),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

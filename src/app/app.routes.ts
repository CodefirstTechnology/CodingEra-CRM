import { Routes } from '@angular/router';
import { CrmShellComponent } from './shell/crm-shell/crm-shell.component';

export const routes: Routes = [
  {
    path: '',
    component: CrmShellComponent,
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
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
    ],
  },
];

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { indiamartLeadsLegacyRedirectGuard } from '../../core/routing/indiamart-lead-feature.guard';
import { DashboardShellComponent } from './dashboard-shell.component';
import { DashboardComponent } from './dashboard.component';
import { IndiamartLeadsLegacyPlaceholderComponent } from './indiamart-leads-legacy-placeholder.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardShellComponent,
    children: [
      { path: '', component: DashboardComponent },
      {
        path: 'indiamart-leads',
        pathMatch: 'full',
        canActivate: [indiamartLeadsLegacyRedirectGuard],
        component: IndiamartLeadsLegacyPlaceholderComponent,
      },
    ],
  },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    DashboardShellComponent,
    DashboardComponent,
    IndiamartLeadsLegacyPlaceholderComponent,
  ],
})
export class DashboardModule {}

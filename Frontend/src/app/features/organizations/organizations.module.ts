import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrganizationDetailComponent } from './organization-detail.component';
import { OrganizationsComponent } from './organizations.component';

const routes: Routes = [
  { path: '', component: OrganizationsComponent },
  { path: ':id', component: OrganizationDetailComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes), OrganizationsComponent, OrganizationDetailComponent],
})
export class OrganizationsModule {}

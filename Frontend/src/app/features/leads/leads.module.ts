import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LeadsComponent } from './leads.component';
import { LeadDetailComponent } from './lead-detail.component';

const routes: Routes = [
  { path: '', component: LeadsComponent },
  { path: ':id', component: LeadDetailComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes), LeadsComponent, LeadDetailComponent],
})
export class LeadsModule {}

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DealDetailComponent } from './deal-detail.component';
import { DealsComponent } from './deals.component';

const routes: Routes = [
  { path: '', component: DealsComponent },
  { path: ':id', component: DealDetailComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes), DealsComponent, DealDetailComponent],
})
export class DealsModule {}

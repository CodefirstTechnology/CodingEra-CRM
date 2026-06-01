import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuotationFormComponent } from './quotation-form.component';
import { QuotationViewComponent } from './quotation-view.component';
import { QuotationsListComponent } from './quotations-list.component';

const routes: Routes = [
  { path: '', component: QuotationsListComponent },
  { path: 'new', component: QuotationFormComponent },
  { path: ':id/edit', component: QuotationFormComponent },
  { path: ':id', component: QuotationViewComponent },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    QuotationsListComponent,
    QuotationFormComponent,
    QuotationViewComponent,
  ],
})
export class QuotationsModule {}

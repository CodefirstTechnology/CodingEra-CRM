import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ContactDetailComponent } from './contact-detail.component';
import { ContactsComponent } from './contacts.component';

const routes: Routes = [
  { path: '', component: ContactsComponent },
  { path: ':id', component: ContactDetailComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes), ContactsComponent, ContactDetailComponent],
})
export class ContactsModule {}

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SimplePageComponent } from './simple-page.component';

const routes: Routes = [{ path: '', component: SimplePageComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes), SimplePageComponent],
})
export class EntityPagesModule {}

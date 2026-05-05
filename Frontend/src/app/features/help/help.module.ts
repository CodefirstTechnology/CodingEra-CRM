import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HelpComponent } from './help.component';

const routes: Routes = [{ path: '', component: HelpComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes), HelpComponent],
})
export class HelpModule {}

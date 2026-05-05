import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CallLogsComponent } from './call-logs.component';

const routes: Routes = [{ path: '', component: CallLogsComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes), CallLogsComponent],
})
export class CallLogsModule {}

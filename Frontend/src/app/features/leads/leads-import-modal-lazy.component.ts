import { Component, input, output } from '@angular/core';
import { ImportLeadsModalComponent } from '../../shared/components/import-leads-modal/import-leads-modal.component';
import type { LeadImportCommitResult } from './import/lead-import-api.models';

/** Lazy-loaded host so xlsx/papaparse/import utilities stay out of the main leads chunk. */
@Component({
  selector: 'app-leads-import-modal-lazy',
  imports: [ImportLeadsModalComponent],
  template: `
    <app-import-leads-modal
      [open]="open()"
      (dismiss)="dismiss.emit()"
      (importCompleted)="importCompleted.emit($event)"
    />
  `,
})
export class LeadsImportModalLazyComponent {
  readonly open = input(false);
  readonly dismiss = output<void>();
  readonly importCompleted = output<LeadImportCommitResult>();
}

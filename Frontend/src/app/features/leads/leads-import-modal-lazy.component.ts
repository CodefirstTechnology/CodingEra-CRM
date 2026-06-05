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
      (dismiss)="onModalDismiss()"
      (importCompleted)="onImportCompleted($event)"
    />
  `,
})
export class LeadsImportModalLazyComponent {
  readonly open = input(false);
  /** Parent callback when using NgComponentOutlet (output bindings can be unreliable). */
  readonly requestClose = input<(() => void) | undefined>();
  readonly requestImportCompleted = input<((result: LeadImportCommitResult) => void) | undefined>();

  readonly dismiss = output<void>();
  readonly importCompleted = output<LeadImportCommitResult>();

  protected onModalDismiss(): void {
    this.dismiss.emit();
    this.requestClose()?.();
  }

  protected onImportCompleted(result: LeadImportCommitResult): void {
    this.importCompleted.emit(result);
    this.requestImportCompleted()?.(result);
  }
}

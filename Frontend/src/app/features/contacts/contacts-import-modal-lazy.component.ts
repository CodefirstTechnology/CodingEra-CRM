import { Component, input, output } from '@angular/core';
import { ImportContactsModalComponent } from '../../shared/components/import-contacts-modal/import-contacts-modal.component';
import type { ContactImportCommitResult } from './import/contact-import-api.models';

/** Lazy-loaded host so xlsx/papaparse/import utilities stay out of the main contacts chunk. */
@Component({
  selector: 'app-contacts-import-modal-lazy',
  imports: [ImportContactsModalComponent],
  template: `
    <app-import-contacts-modal
      [open]="open()"
      (dismiss)="onModalDismiss()"
      (importCompleted)="onImportCompleted($event)"
    />
  `,
})
export class ContactsImportModalLazyComponent {
  readonly open = input(false);
  /** Parent callback when using NgComponentOutlet (output bindings can be unreliable). */
  readonly requestClose = input<(() => void) | undefined>();
  readonly requestImportCompleted = input<((result: ContactImportCommitResult) => void) | undefined>();

  readonly dismiss = output<void>();
  readonly importCompleted = output<ContactImportCommitResult>();

  protected onModalDismiss(): void {
    this.dismiss.emit();
    this.requestClose()?.();
  }

  protected onImportCompleted(result: ContactImportCommitResult): void {
    this.importCompleted.emit(result);
    this.requestImportCompleted()?.(result);
  }
}

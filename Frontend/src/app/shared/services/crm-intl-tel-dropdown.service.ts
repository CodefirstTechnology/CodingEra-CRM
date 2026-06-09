import { Injectable } from '@angular/core';
import { handleCrmIntlTelDocumentMouseDown } from '../utils/intl-tel-dropdown.util';

/** Registers a document-level listener so intl-tel country lists close on outside click. */
@Injectable({ providedIn: 'root' })
export class CrmIntlTelDropdownService {
  private registered = false;

  init(): void {
    if (this.registered || typeof document === 'undefined') return;
    this.registered = true;
    document.addEventListener('mousedown', handleCrmIntlTelDocumentMouseDown, true);
  }
}

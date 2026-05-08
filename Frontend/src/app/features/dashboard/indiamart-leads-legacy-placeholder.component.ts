import { Component } from '@angular/core';

/**
 * Never renders: `/dashboard/indiamart-leads` always redirects via
 * {@link indiamartLeadsLegacyRedirectGuard} before activation.
 */
@Component({
  standalone: true,
  template: '',
})
export class IndiamartLeadsLegacyPlaceholderComponent {}

import { Component, input, output, signal } from '@angular/core';
import {
  QuotationTemplateType,
  type QuotationTemplateType as QuotationTemplateTypeValue,
} from '../../../core/services/quotations/quotation-template.constants';

@Component({
  selector: 'app-create-quotation-menu',
  templateUrl: './create-quotation-menu.component.html',
  styleUrl: './create-quotation-menu.component.scss',
})
export class CreateQuotationMenuComponent {
  readonly disabled = input(false);
  readonly label = input('Create Quotation');
  readonly templateSelect = output<QuotationTemplateTypeValue>();

  protected readonly menuOpen = signal(false);

  protected readonly standardTemplate = QuotationTemplateType.Standard;
  protected readonly technicalTemplate = QuotationTemplateType.TechnicalProposal;

  protected toggleMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.disabled()) return;
    this.menuOpen.update((v) => !v);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected pickTemplate(template: QuotationTemplateTypeValue, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
    this.templateSelect.emit(template);
  }
}

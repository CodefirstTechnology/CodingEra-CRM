import { Component, input, output } from '@angular/core';
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
  /** `surface` matches neutral header buttons on deal detail. */
  readonly variant = input<'primary' | 'surface'>('primary');
  readonly templateSelect = output<QuotationTemplateTypeValue>();

  protected readonly standardTemplate = QuotationTemplateType.Standard;
  protected readonly technicalTemplate = QuotationTemplateType.TechnicalProposal;

  protected onSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value as QuotationTemplateTypeValue;
    select.value = '';
    if (!value) return;
    this.templateSelect.emit(value);
  }
}

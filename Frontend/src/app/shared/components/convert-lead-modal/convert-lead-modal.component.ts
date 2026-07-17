import { Component, input, output, signal } from '@angular/core';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import type { ConvertLeadOptions } from '../../../core/services/leads/lead-conversion.types';

@Component({
  selector: 'app-convert-lead-modal',
  imports: [CrmModalComponent],
  templateUrl: './convert-lead-modal.component.html',
  styleUrl: './convert-lead-modal.component.scss',
})
export class ConvertLeadModalComponent {
  readonly open = input(false);
  readonly leadCount = input(1);
  readonly leadPreview = input('');
  /** Display name of the master conversion status (defaults to Converted). */
  readonly conversionStatusLabel = input('Converted');

  readonly confirm = output<ConvertLeadOptions>();
  readonly dismiss = output<void>();

  protected readonly markAsConverted = signal(true);
  protected readonly removeFromActive = signal(false);

  protected onDismiss(): void {
    this.dismiss.emit();
  }

  protected onConfirm(): void {
    this.confirm.emit({
      markAsConverted: this.markAsConverted(),
      removeFromActive: this.removeFromActive(),
    });
  }

  protected onMarkConvertedChange(ev: Event): void {
    this.markAsConverted.set((ev.target as HTMLInputElement).checked);
  }

  protected onRemoveFromActiveChange(ev: Event): void {
    this.removeFromActive.set((ev.target as HTMLInputElement).checked);
  }
}

import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import {
  isLeadImportXlsxFile,
  LEAD_IMPORT_ACCEPT,
} from '../../../features/leads/import/lead-import.constants';
import { downloadLeadImportTemplate } from '../../../features/leads/import/lead-import-template.util';

@Component({
  selector: 'app-import-leads-modal',
  imports: [CrmModalComponent],
  templateUrl: './import-leads-modal.component.html',
  styleUrl: './import-leads-modal.component.scss',
})
export class ImportLeadsModalComponent {
  readonly open = input(false);

  readonly dismiss = output<void>();
  /** Emitted when user picks a valid `.xlsx` file (import processing is a later step). */
  readonly fileSelected = output<File>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly accept = LEAD_IMPORT_ACCEPT;
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly fileError = signal<string | null>(null);

  protected onDismiss(): void {
    this.resetState();
    this.dismiss.emit();
  }

  protected onDownloadTemplate(): void {
    downloadLeadImportTemplate();
  }

  protected onBrowseClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFileInputChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.applyFile(file);
    input.value = '';
  }

  protected onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOver.set(true);
  }

  protected onDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOver.set(false);
  }

  protected onDrop(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOver.set(false);
    const file = ev.dataTransfer?.files?.[0] ?? null;
    this.applyFile(file);
  }

  protected clearSelectedFile(): void {
    this.selectedFile.set(null);
    this.fileError.set(null);
  }

  private applyFile(file: File | null): void {
    if (!file) return;
    if (!isLeadImportXlsxFile(file)) {
      this.selectedFile.set(null);
      this.fileError.set('Only .xlsx Excel files are supported.');
      return;
    }
    this.fileError.set(null);
    this.selectedFile.set(file);
    this.fileSelected.emit(file);
  }

  private resetState(): void {
    this.selectedFile.set(null);
    this.dragOver.set(false);
    this.fileError.set(null);
  }
}

import { DecimalPipe } from '@angular/common';
import { Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import { LeadsService, leadsHttpErrorMessage } from '../../../core/services/leads.service';
import { ToastService } from '../../../core/toast/toast.service';
import {
  isLeadImportFile,
  LEAD_IMPORT_ACCEPT,
  LEAD_IMPORT_UNSUPPORTED_FILE_MESSAGE,
} from '../../../features/leads/import/lead-import.constants';
import { LEAD_IMPORT_REQUIRED_FIELD_LABELS } from '../../../features/leads/import/lead-import-validation.util';
import { mapParsedRowsToImportDtosAsync } from '../../../features/leads/import/lead-import-api.mapper';
import type { LeadImportCommitResult } from '../../../features/leads/import/lead-import-api.models';
import {
  downloadImportErrorsXlsx,
  hasImportErrors,
} from '../../../features/leads/import/lead-import-errors.util';
import { LEAD_IMPORT_PREVIEW_MAX_ROWS, type LeadImportProgress } from '../../../features/leads/import/lead-import.models';
import { parseLeadImportFile } from '../../../features/leads/import/lead-import-parser.util';
import { downloadLeadImportCsvTemplate, downloadLeadImportTemplate } from '../../../features/leads/import/lead-import-template.util';
import type { LeadImportParseResult } from '../../../features/leads/import/lead-import.models';

@Component({
  selector: 'app-import-leads-modal',
  imports: [CrmModalComponent, DecimalPipe],
  templateUrl: './import-leads-modal.component.html',
  styleUrl: './import-leads-modal.component.scss',
})
export class ImportLeadsModalComponent {
  readonly open = input(false);

  readonly dismiss = output<void>();
  readonly importCompleted = output<LeadImportCommitResult>();
  readonly fileSelected = output<File>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly leadsService = inject(LeadsService);
  private readonly toast = inject(ToastService);

  protected readonly accept = LEAD_IMPORT_ACCEPT;
  protected readonly previewMaxRows = LEAD_IMPORT_PREVIEW_MAX_ROWS;
  protected readonly requiredFieldLabels = LEAD_IMPORT_REQUIRED_FIELD_LABELS;

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly parseResult = signal<LeadImportParseResult | null>(null);
  protected readonly commitResult = signal<LeadImportCommitResult | null>(null);
  protected readonly parsing = signal(false);
  protected readonly importing = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly fileError = signal<string | null>(null);
  protected readonly progress = signal<LeadImportProgress | null>(null);

  protected readonly isBusy = computed(() => this.parsing() || this.importing());

  protected readonly modalSize = computed(() =>
    this.parseResult() ? ('lg' as const) : ('md' as const),
  );

  protected readonly previewRows = computed(() => {
    const result = this.parseResult();
    if (!result) return [];
    return result.rows.slice(0, LEAD_IMPORT_PREVIEW_MAX_ROWS);
  });

  protected readonly previewHiddenCount = computed(() => {
    const result = this.parseResult();
    if (!result) return 0;
    return Math.max(0, result.rows.length - LEAD_IMPORT_PREVIEW_MAX_ROWS);
  });

  protected readonly preImportSummary = computed(() => this.parseResult()?.summary ?? null);

  protected readonly importResult = computed(() => this.commitResult());

  protected readonly canDownloadErrors = computed(() =>
    hasImportErrors(this.commitResult()?.validationErrors),
  );

  protected readonly progressDetail = computed(() => this.progress()?.detail ?? '');

  protected readonly progressPercent = computed(() => this.progress()?.percent ?? 0);

  protected readonly progressIndeterminate = computed(
    () => this.importing() && this.progress()?.phase === 'uploading',
  );

  protected onDismiss(): void {
    if (this.parsing() || this.importing()) {
      this.parsing.set(false);
      this.importing.set(false);
      this.progress.set(null);
    }
    this.resetState();
    this.dismiss.emit();
  }

  protected onDownloadTemplate(): void {
    void downloadLeadImportTemplate();
  }

  protected onDownloadCsvTemplate(): void {
    downloadLeadImportCsvTemplate();
  }

  protected onDownloadErrors(): void {
    const errors = this.commitResult()?.validationErrors;
    if (!hasImportErrors(errors)) return;
    void downloadImportErrorsXlsx(errors!);
  }

  protected onBrowseClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFileInputChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    void this.applyFile(file);
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
    void this.applyFile(file);
  }

  protected clearSelectedFile(): void {
    if (this.importing()) return;
    this.selectedFile.set(null);
    this.parseResult.set(null);
    this.commitResult.set(null);
    this.fileError.set(null);
    this.progress.set(null);
  }

  protected async onImport(): Promise<void> {
    const result = this.parseResult();
    if (!result || this.importing()) return;

    this.importing.set(true);
    this.fileError.set(null);
    this.commitResult.set(null);

    try {
      const rows = await mapParsedRowsToImportDtosAsync(result.rows, result.columns, (p) =>
        this.progress.set(p),
      );

      this.progress.set({
        phase: 'uploading',
        percent: 96,
        detail: `Uploading ${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}…`,
      });

      const commitResult = await firstValueFrom(this.leadsService.commitImport(rows));
      this.commitResult.set(commitResult);
      this.progress.set({ phase: 'uploading', percent: 100, detail: 'Import complete' });

      const { importedCount, duplicateCount, invalidCount } = commitResult;

      if (importedCount > 0) {
        this.toast.success(
          `Imported ${importedCount.toLocaleString()} lead${importedCount === 1 ? '' : 's'}.` +
            (duplicateCount || invalidCount
              ? ` ${duplicateCount.toLocaleString()} duplicate${duplicateCount === 1 ? '' : 's'} skipped, ${invalidCount.toLocaleString()} invalid.`
              : ''),
        );
        this.importCompleted.emit(commitResult);
      } else {
        this.toast.error(
          `Import finished with no leads saved. ${duplicateCount.toLocaleString()} duplicate${duplicateCount === 1 ? '' : 's'} skipped, ${invalidCount.toLocaleString()} invalid row${invalidCount === 1 ? '' : 's'}.`,
        );
      }
    } catch (err: unknown) {
      const message = leadsHttpErrorMessage(err);
      this.fileError.set(message);
      this.toast.error(message);
    } finally {
      this.importing.set(false);
      this.progress.set(null);
    }
  }

  protected cellValue(row: { values: Record<string, string> }, column: string): string {
    return row.values[column]?.trim() || '—';
  }

  private async applyFile(file: File | null): Promise<void> {
    if (!file) return;
    if (!isLeadImportFile(file)) {
      this.selectedFile.set(null);
      this.parseResult.set(null);
      this.commitResult.set(null);
      this.fileError.set(LEAD_IMPORT_UNSUPPORTED_FILE_MESSAGE);
      return;
    }

    this.fileError.set(null);
    this.selectedFile.set(file);
    this.parseResult.set(null);
    this.commitResult.set(null);
    this.parsing.set(true);
    this.progress.set({ phase: 'reading', percent: 0, detail: 'Starting…' });
    this.fileSelected.emit(file);

    try {
      const result = await parseLeadImportFile(file, {
        onProgress: (p) => this.progress.set(p),
      });
      if (result.summary.parsedRows === 0) {
        this.fileError.set('No data rows found. Add lead rows below the header row.');
        this.parseResult.set(null);
        return;
      }
      this.parseResult.set(result);
    } catch (err: unknown) {
      this.parseResult.set(null);
      const message = err instanceof Error ? err.message : 'Could not read the file.';
      this.fileError.set(message);
      this.toast.error(message);
    } finally {
      this.parsing.set(false);
      this.progress.set(null);
    }
  }

  private resetState(): void {
    this.selectedFile.set(null);
    this.parseResult.set(null);
    this.commitResult.set(null);
    this.parsing.set(false);
    this.importing.set(false);
    this.dragOver.set(false);
    this.fileError.set(null);
    this.progress.set(null);
  }
}

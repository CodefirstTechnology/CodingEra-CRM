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
import { mapParsedRowsToImportDtos } from '../../../features/leads/import/lead-import-api.mapper';
import type { LeadImportCommitResult } from '../../../features/leads/import/lead-import-api.models';
import { LEAD_IMPORT_PREVIEW_MAX_ROWS } from '../../../features/leads/import/lead-import.models';
import { parseLeadImportFile } from '../../../features/leads/import/lead-import-parser.util';
import { downloadLeadImportTemplate } from '../../../features/leads/import/lead-import-template.util';
import type { LeadImportParseResult } from '../../../features/leads/import/lead-import.models';

@Component({
  selector: 'app-import-leads-modal',
  imports: [CrmModalComponent],
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

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly parseResult = signal<LeadImportParseResult | null>(null);
  protected readonly commitResult = signal<LeadImportCommitResult | null>(null);
  protected readonly parsing = signal(false);
  protected readonly importing = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly fileError = signal<string | null>(null);

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

  protected readonly summary = computed(() => {
    const committed = this.commitResult();
    if (committed) {
      return {
        totalRows: this.parseResult()?.summary.totalRows ?? 0,
        parsedRows: this.parseResult()?.summary.parsedRows ?? 0,
        validRows: committed.importedCount,
        duplicateRows: committed.duplicateCount,
        invalidRows: committed.invalidCount,
        isCommitted: true as const,
      };
    }

    const parsed = this.parseResult()?.summary;
    if (!parsed) return null;
    return { ...parsed, isCommitted: false as const };
  });

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
    this.selectedFile.set(null);
    this.parseResult.set(null);
    this.commitResult.set(null);
    this.fileError.set(null);
  }

  protected async onImport(): Promise<void> {
    const result = this.parseResult();
    if (!result || this.importing()) return;

    this.importing.set(true);
    this.fileError.set(null);

    try {
      const rows = mapParsedRowsToImportDtos(result.rows, result.columns);
      const commitResult = await firstValueFrom(this.leadsService.commitImport(rows));
      this.commitResult.set(commitResult);
      this.importCompleted.emit(commitResult);

      const { importedCount, duplicateCount, invalidCount } = commitResult;
      if (importedCount > 0) {
        this.toast.success(
          `Imported ${importedCount} lead${importedCount === 1 ? '' : 's'}` +
            (duplicateCount || invalidCount
              ? ` (${duplicateCount} duplicate, ${invalidCount} invalid skipped)`
              : ''),
        );
      } else {
        this.toast.info(
          `No leads imported (${duplicateCount} duplicate, ${invalidCount} invalid).`,
        );
      }
    } catch (err: unknown) {
      this.fileError.set(leadsHttpErrorMessage(err));
    } finally {
      this.importing.set(false);
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
    this.fileSelected.emit(file);

    try {
      const result = await parseLeadImportFile(file);
      if (result.summary.parsedRows === 0) {
        this.fileError.set('No data rows found. Add lead rows below the header row.');
        this.parseResult.set(null);
        return;
      }
      this.parseResult.set(result);
    } catch (err: unknown) {
      this.parseResult.set(null);
      this.fileError.set(err instanceof Error ? err.message : 'Could not read the file.');
    } finally {
      this.parsing.set(false);
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
  }
}

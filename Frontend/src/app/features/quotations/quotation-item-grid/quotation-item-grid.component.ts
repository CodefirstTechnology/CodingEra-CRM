import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription, take } from 'rxjs';
import {
  DEFAULT_QUOTATION_GRID_COLUMNS,
  gridColumnFormControl,
  mergeGridColumns,
  NUMERIC_GRID_COLUMN_KEYS,
  type QuotationGridColumn,
  type QuotationGridColumnKey,
} from '../../../core/services/quotations/quotation-grid.constants';
import {
  aggregateQuotationLines,
  recalcLineGroupValues,
} from '../../../core/services/quotations/quotation-line-calc.util';
import { QuotationsService, quotationHttpErrorMessage } from '../../../core/services/quotations.service';
import { UserDataScopeService } from '../../../core/services/user-data-scope.service';
import { ToastService } from '../../../core/toast/toast.service';
import { createQuotationLineGroup } from '../quotation-line-form.util';

@Component({
  selector: 'app-quotation-item-grid',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './quotation-item-grid.component.html',
  styleUrl: './quotation-item-grid.component.scss',
  host: { class: 'quotation-item-grid-host' },
})
export class QuotationItemGridComponent implements OnDestroy {
  readonly lineItems = input.required<FormArray>();

  private readonly fb = inject(FormBuilder);
  private readonly quotationsService = inject(QuotationsService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly toast = inject(ToastService);

  protected readonly columns = signal<QuotationGridColumn[]>(DEFAULT_QUOTATION_GRID_COLUMNS);
  protected readonly searchQuery = signal('');
  protected readonly configOpen = signal(false);
  protected readonly savingConfig = signal(false);
  protected readonly draftColumns = signal<QuotationGridColumn[]>([]);
  protected readonly isAdmin = computed(() => this.userScope.isAdminSession());
  protected readonly dragRowIndex = signal<number | null>(null);
  protected readonly dragColIndex = signal<number | null>(null);
  protected readonly recalcTick = signal(0);

  protected readonly visibleColumns = computed(() =>
    this.columns()
      .filter((c) => c.visible && c.key !== 'srNo')
      .sort((a, b) => a.order - b.order),
  );

  protected readonly filteredIndices = computed(() => {
    this.recalcTick();
    const q = this.searchQuery().trim().toLowerCase();
    const fa = this.lineItems();
    const indices: number[] = [];
    for (let i = 0; i < fa.length; i++) {
      if (!q) {
        indices.push(i);
        continue;
      }
      const g = fa.at(i) as FormGroup;
      const name = String(g.controls['itemName']?.value ?? '').toLowerCase();
      const desc = String(g.controls['description']?.value ?? '').toLowerCase();
      const code = String(g.controls['itemCode']?.value ?? '').toLowerCase();
      if (name.includes(q) || desc.includes(q) || code.includes(q)) {
        indices.push(i);
      }
    }
    return indices;
  });

  protected readonly totals = computed(() => {
    this.recalcTick();
    const fa = this.lineItems();
    const rows = fa.controls.map((ctrl) => {
      const g = ctrl as FormGroup;
      const raw = g.getRawValue();
      const amounts = recalcLineGroupValues(raw);
      return { quantity: Number(raw.quantity) || 0, amounts };
    });
    return aggregateQuotationLines(rows);
  });

  private lineSubs: Subscription[] = [];
  private faSub: Subscription | null = null;

  constructor() {
    this.loadColumns();
    effect(() => {
      const fa = this.lineItems();
      this.bindFormArray(fa);
    });
  }

  ngOnDestroy(): void {
    this.clearSubs();
  }

  protected addRow(): void {
    this.lineItems().push(createQuotationLineGroup(this.fb));
    this.bindFormArray(this.lineItems());
  }

  protected removeRow(index: number): void {
    const fa = this.lineItems();
    if (fa.length <= 1) return;
    fa.removeAt(index);
    this.bindFormArray(fa);
  }

  protected openConfig(): void {
    this.draftColumns.set(this.columns().map((c) => ({ ...c })));
    this.configOpen.set(true);
  }

  protected closeConfig(): void {
    this.configOpen.set(false);
  }

  protected lineAt(index: number): FormGroup {
    return this.lineItems().at(index) as FormGroup;
  }

  protected setColumnVisible(key: QuotationGridColumnKey, visible: boolean): void {
    this.draftColumns.update((cols) =>
      cols.map((c) => (c.key === key ? { ...c, visible } : c)),
    );
  }

  protected updateColumnWidth(key: QuotationGridColumnKey, event: Event): void {
    const w = Math.max(48, Math.min(480, Number((event.target as HTMLInputElement).value) || 100));
    this.draftColumns.update((cols) =>
      cols.map((c) => (c.key === key ? { ...c, width: w } : c)),
    );
  }

  protected applyColumnConfig(saveAsDefault = false): void {
    const merged = mergeGridColumns(this.draftColumns());
    this.savingConfig.set(true);
    const req$ = saveAsDefault
      ? this.quotationsService.saveItemGridDefaults({ columns: merged })
      : this.quotationsService.saveItemGridColumns({ columns: merged });

    req$.pipe(take(1)).subscribe({
      next: (res) => {
        this.columns.set(mergeGridColumns(res.columns as QuotationGridColumn[]));
        this.savingConfig.set(false);
        this.configOpen.set(false);
        this.toast.success(saveAsDefault ? 'Default grid layout saved.' : 'Grid layout saved.');
      },
      error: (err) => {
        this.savingConfig.set(false);
        this.toast.error(quotationHttpErrorMessage(err, 'Could not save grid layout.'));
      },
    });
  }

  protected onRowDragStart(index: number, event: DragEvent): void {
    this.dragRowIndex.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onRowDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected onRowDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragRowIndex();
    this.dragRowIndex.set(null);
    if (from == null || from === targetIndex) return;
    this.moveRow(from, targetIndex);
  }

  protected onColDragStart(index: number, event: DragEvent): void {
    this.dragColIndex.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
  }

  protected onColDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragColIndex();
    this.dragColIndex.set(null);
    if (from == null || from === targetIndex) return;
    this.draftColumns.update((cols) => {
      const sorted = [...cols].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(from, 1);
      sorted.splice(targetIndex, 0, moved);
      return sorted.map((c, i) => ({ ...c, order: i }));
    });
  }

  protected columnWidth(col: QuotationGridColumn): string {
    return `${col.width}px`;
  }

  protected isNumericColumn(key: QuotationGridColumnKey): boolean {
    return NUMERIC_GRID_COLUMN_KEYS.has(key);
  }

  protected formControlName(col: QuotationGridColumn): string | null {
    return gridColumnFormControl(col.key);
  }

  protected onLineInput(index: number): void {
    this.recalcRow(index);
    this.bumpRecalc();
  }

  protected displayAmount(index: number): number {
    const g = this.lineItems().at(index) as FormGroup;
    return Number(g.controls['amount']?.value) || 0;
  }

  protected sortedDraftColumns(): QuotationGridColumn[] {
    return [...this.draftColumns()]
      .filter((c) => c.key !== 'srNo')
      .sort((a, b) => a.order - b.order);
  }

  private moveRow(from: number, to: number): void {
    const fa = this.lineItems();
    const ctrl = fa.at(from);
    fa.removeAt(from);
    fa.insert(to, ctrl);
    this.bindFormArray(fa);
  }

  private recalcRow(index: number): void {
    const g = this.lineItems().at(index) as FormGroup;
    const raw = g.getRawValue();
    const calc = recalcLineGroupValues(raw);
    g.patchValue(
      { amount: calc.amount, taxAmount: calc.taxAmount, lineTotal: calc.lineTotal },
      { emitEvent: false },
    );
  }

  private bumpRecalc(): void {
    this.recalcTick.update((n) => n + 1);
  }

  private loadColumns(): void {
    this.quotationsService
      .getItemGridColumns()
      .pipe(take(1))
      .subscribe({
        next: (res) => this.columns.set(mergeGridColumns(res.columns as QuotationGridColumn[])),
        error: () => this.columns.set(DEFAULT_QUOTATION_GRID_COLUMNS),
      });
  }

  private bindFormArray(fa: FormArray): void {
    this.clearSubs();
    this.faSub = fa.valueChanges.subscribe(() => {
      fa.controls.forEach((_, i) => this.recalcRow(i));
      this.bumpRecalc();
    });
    fa.controls.forEach((_, i) => this.recalcRow(i));
    this.bumpRecalc();
  }

  private clearSubs(): void {
    this.faSub?.unsubscribe();
    this.faSub = null;
    for (const sub of this.lineSubs) sub.unsubscribe();
    this.lineSubs = [];
  }
}

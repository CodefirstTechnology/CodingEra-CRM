import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { forkJoin, Subscription, take } from 'rxjs';
import type { QuotationCatalogItem } from '../../../core/services/item-master/item-master-api.models';
import { ItemMasterHttpService } from '../../../core/services/item-master/item-master-http.service';
import { patchLineFromCatalogItem } from '../../../core/services/quotations/quotation-catalog-line.util';
import {
  catalogColumnsToGridColumns,
  FIXED_QUOTATION_GRID_COLUMNS,
  gridColumnFormControl,
  isDynamicColumnKey,
  mergeQuotationGridColumns,
  NUMERIC_GRID_COLUMN_KEYS,
  type QuotationGridColumn,
} from '../../../core/services/quotations/quotation-grid.constants';
import {
  parseItemSnapshot,
  setSnapshotFieldValue,
  snapshotFieldValue,
  stringifyItemSnapshot,
} from '../../../core/services/quotations/quotation-item-snapshot.util';
import {
  additionalChargesTotal,
  normalizeChargeAmount,
} from '../../../core/services/quotations/quotation-additional-charges.util';
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
  readonly gstPercent = input(0);
  readonly transportationCharges = input.required<FormControl<number | string | null>>();
  readonly loadingCharges = input.required<FormControl<number | string | null>>();
  readonly serviceCharges = input.required<FormControl<number | string | null>>();
  readonly customCharges = input.required<FormArray>();

  readonly gstPercentChange = output<number>();
  readonly addCustomCharge = output<void>();
  readonly removeCustomCharge = output<number>();

  private readonly fb = inject(FormBuilder);
  private readonly quotationsService = inject(QuotationsService);
  private readonly itemMasterApi = inject(ItemMasterHttpService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly toast = inject(ToastService);

  protected readonly catalogItems = signal<QuotationCatalogItem[]>([]);
  protected readonly dynamicGridCols = signal<QuotationGridColumn[]>([]);
  protected readonly columns = signal<QuotationGridColumn[]>(FIXED_QUOTATION_GRID_COLUMNS);
  protected readonly searchQuery = signal('');
  protected readonly configOpen = signal(false);
  protected readonly savingConfig = signal(false);
  protected readonly draftColumns = signal<QuotationGridColumn[]>([]);
  protected readonly isAdmin = computed(() => this.userScope.isAdminSession());
  protected readonly dragRowIndex = signal<number | null>(null);
  protected readonly dragColIndex = signal<number | null>(null);
  protected readonly recalcTick = signal(0);
  protected readonly itemPickerRow = signal<number | null>(null);
  protected readonly itemPickerQuery = signal('');
  protected readonly itemPickerRect = signal<{ top: number; left: number; width: number } | null>(
    null,
  );

  private itemPickerTriggerEl: HTMLElement | null = null;
  private itemPickerScrollHandler: (() => void) | null = null;
  private itemPickerScrollTargets: Array<Window | Element> = [];

  protected readonly filteredCatalogItems = computed(() => {
    const q = this.itemPickerQuery().trim().toLowerCase();
    const items = this.catalogItems();
    if (!q) return items.slice(0, 80);
    return items
      .filter(
        (i) =>
          i.itemName.toLowerCase().includes(q) ||
          i.itemCode.toLowerCase().includes(q),
      )
      .slice(0, 80);
  });

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
    this.gstPercent();
    this.transportationCharges().value;
    this.loadingCharges().value;
    this.serviceCharges().value;
    this.customCharges().length;
    const fa = this.lineItems();
    const rows = fa.controls.map((ctrl) => {
      const g = ctrl as FormGroup;
      const raw = g.getRawValue();
      const amounts = recalcLineGroupValues(raw);
      return { quantity: Number(raw.quantity) || 0, amounts };
    });
    const additional = additionalChargesTotal({
      transportationCharges: normalizeChargeAmount(this.transportationCharges().value),
      loadingCharges: normalizeChargeAmount(this.loadingCharges().value),
      serviceCharges: normalizeChargeAmount(this.serviceCharges().value),
      customCharges: this.customCharges().controls.map((ctrl, i) => {
        const raw = (ctrl as FormGroup).getRawValue() as { chargeName?: string; amount?: number };
        return {
          sortIndex: i,
          chargeName: String(raw.chargeName ?? ''),
          amount: normalizeChargeAmount(raw.amount),
        };
      }),
    });
    return aggregateQuotationLines(rows, Number(this.gstPercent()) || 0, additional);
  });

  private lineSubs: Subscription[] = [];
  private faSub: Subscription | null = null;

  constructor() {
    this.loadCatalogAndColumns();
    effect(() => {
      const fa = this.lineItems();
      this.bindFormArray(fa);
    });
  }

  ngOnDestroy(): void {
    this.unbindItemPickerScrollTracking();
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

  protected setColumnVisible(key: string, visible: boolean): void {
    this.draftColumns.update((cols) =>
      cols.map((c) => (c.key === key ? { ...c, visible } : c)),
    );
  }

  protected updateColumnWidth(key: string, event: Event): void {
    const w = Math.max(48, Math.min(480, Number((event.target as HTMLInputElement).value) || 100));
    this.draftColumns.update((cols) =>
      cols.map((c) => (c.key === key ? { ...c, width: w } : c)),
    );
  }

  protected applyColumnConfig(saveAsDefault = false): void {
    const merged = mergeQuotationGridColumns(this.draftColumns(), this.dynamicGridCols());
    this.savingConfig.set(true);
    const req$ = saveAsDefault
      ? this.quotationsService.saveItemGridDefaults({ columns: merged })
      : this.quotationsService.saveItemGridColumns({ columns: merged });

    req$.pipe(take(1)).subscribe({
      next: (res) => {
        this.columns.set(
          mergeQuotationGridColumns(
            (res.columns?.length ? res.columns : merged) as QuotationGridColumn[],
            this.dynamicGridCols(),
          ),
        );
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
      const srNo = cols.find((c) => c.key === 'srNo');
      const sorted = cols
        .filter((c) => c.key !== 'srNo')
        .sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(from, 1);
      sorted.splice(targetIndex, 0, moved);
      const reordered = sorted.map((c, i) => ({ ...c, order: i + 1 }));
      return srNo ? [{ ...srNo, order: 0 }, ...reordered] : reordered;
    });
  }

  protected columnWidth(col: QuotationGridColumn): string {
    return `${col.width}px`;
  }

  protected isNumericColumn(key: string): boolean {
    return NUMERIC_GRID_COLUMN_KEYS.has(key);
  }

  protected formControlName(col: QuotationGridColumn): string | null {
    return gridColumnFormControl(col.key);
  }

  protected isDynamicColumn(key: string): boolean {
    return isDynamicColumnKey(key);
  }

  protected dynamicCellValue(index: number, columnKey: string): string {
    const g = this.lineItems().at(index) as FormGroup;
    const snapshot = parseItemSnapshot(String(g.controls['itemSnapshotJson']?.value ?? ''));
    return snapshotFieldValue(snapshot, columnKey);
  }

  protected onDynamicCellInput(index: number, column: QuotationGridColumn, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const g = this.lineItems().at(index) as FormGroup;
    const snapshot = parseItemSnapshot(String(g.controls['itemSnapshotJson']?.value ?? ''));
    const updated = setSnapshotFieldValue(snapshot, column.key, value, column.label);
    const patch: Record<string, unknown> = {
      itemSnapshotJson: stringifyItemSnapshot(updated),
    };
    if (updated.unitWeight !== snapshot.unitWeight) {
      patch['unitWeight'] = updated.unitWeight;
    }
    g.patchValue(patch);
    this.recalcRow(index);
    this.bumpRecalc();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.closeItemPicker();
  }

  @HostListener('document:click')
  protected onDocumentClick(): void {
    this.closeItemPicker();
  }

  @HostListener('window:resize')
  protected repositionItemPicker(): void {
    if (this.itemPickerTriggerEl) this.syncItemPickerRect(this.itemPickerTriggerEl);
  }

  protected isItemPickerOpen(index: number): boolean {
    return this.itemPickerRow() === index;
  }

  protected selectedItemLabel(index: number): string {
    const id = this.selectedItemId(index);
    if (id != null) {
      const hit = this.catalogItems().find((i) => i.id === id);
      if (hit) return hit.itemName;
    }
    const g = this.lineItems().at(index) as FormGroup;
    return String(g.controls['itemName']?.value ?? '').trim();
  }

  protected toggleItemPicker(index: number, event: Event): void {
    event.stopPropagation();
    if (this.itemPickerRow() === index) {
      this.closeItemPicker();
      return;
    }
    const trigger = event.currentTarget as HTMLElement;
    this.itemPickerRow.set(index);
    this.itemPickerQuery.set('');
    this.itemPickerTriggerEl = trigger;
    this.syncItemPickerRect(trigger);
    this.bindItemPickerScrollTracking(trigger);
    window.setTimeout(() => {
      (document.querySelector('.qt-item-picker__panel--fixed .qt-item-picker__search') as HTMLInputElement | null)?.focus();
    }, 0);
  }

  protected closeItemPicker(): void {
    this.unbindItemPickerScrollTracking();
    this.itemPickerRow.set(null);
    this.itemPickerQuery.set('');
    this.itemPickerRect.set(null);
    this.itemPickerTriggerEl = null;
  }

  protected onItemPickerSearchInput(event: Event): void {
    this.itemPickerQuery.set((event.target as HTMLInputElement).value);
  }

  protected selectCatalogItem(index: number, item: QuotationCatalogItem, event: Event): void {
    event.preventDefault();
    const g = this.lineItems().at(index) as FormGroup;
    g.patchValue(patchLineFromCatalogItem(item));
    this.recalcRow(index);
    this.bumpRecalc();
    this.closeItemPicker();
  }

  private syncItemPickerRect(trigger: HTMLElement): void {
    const r = trigger.getBoundingClientRect();
    const width = Math.max(r.width, 240);
    const maxHeight = 280;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.bottom + 2;
    if (top + maxHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - maxHeight - 2);
    }
    this.itemPickerRect.set({ top, left, width });
  }

  private bindItemPickerScrollTracking(trigger: HTMLElement): void {
    this.unbindItemPickerScrollTracking();
    const handler = () => this.onItemPickerScroll();
    this.itemPickerScrollHandler = handler;

    window.addEventListener('scroll', handler, { passive: true });
    this.itemPickerScrollTargets.push(window);

    const scrollingElement = document.scrollingElement;
    if (scrollingElement) {
      scrollingElement.addEventListener('scroll', handler, { passive: true });
      this.itemPickerScrollTargets.push(scrollingElement);
    }

    let el: HTMLElement | null = trigger.parentElement;
    while (el) {
      if (this.isScrollContainer(el)) {
        el.addEventListener('scroll', handler, { passive: true });
        this.itemPickerScrollTargets.push(el);
      }
      el = el.parentElement;
    }
  }

  private unbindItemPickerScrollTracking(): void {
    if (!this.itemPickerScrollHandler) return;
    for (const target of this.itemPickerScrollTargets) {
      target.removeEventListener('scroll', this.itemPickerScrollHandler);
    }
    this.itemPickerScrollTargets = [];
    this.itemPickerScrollHandler = null;
  }

  private onItemPickerScroll(): void {
    const trigger = this.itemPickerTriggerEl;
    if (!trigger) return;

    const r = trigger.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
      this.closeItemPicker();
      return;
    }

    this.syncItemPickerRect(trigger);
  }

  private isScrollContainer(el: HTMLElement): boolean {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const scrollableY =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight;
    const scrollableX =
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      el.scrollWidth > el.clientWidth;
    return scrollableY || scrollableX;
  }

  protected selectedItemId(index: number): number | null {
    const g = this.lineItems().at(index) as FormGroup;
    const v = g.controls['itemId']?.value;
    return v != null && v !== '' ? Number(v) : null;
  }

  protected onLineInput(index: number): void {
    this.recalcRow(index);
    this.bumpRecalc();
  }

  protected onGstInput(event: Event): void {
    const value = Math.max(0, Number((event.target as HTMLInputElement).value) || 0);
    this.gstPercentChange.emit(value);
    this.bumpRecalc();
  }

  protected onChargeInput(): void {
    this.bumpRecalc();
  }

  protected onChargeBlur(control: FormControl<number | string | null>): void {
    const value = normalizeChargeAmount(control.value);
    control.setValue(value, { emitEvent: false });
    this.bumpRecalc();
  }

  protected onCustomChargeAmountBlur(index: number): void {
    const g = this.customChargeAt(index);
    const control = g.controls['amount'] as FormControl<number | string | null>;
    this.onChargeBlur(control);
  }

  protected customChargeAt(index: number): FormGroup {
    return this.customCharges().at(index) as FormGroup;
  }

  protected requestAddCustomCharge(): void {
    this.addCustomCharge.emit();
    this.bumpRecalc();
  }

  protected requestRemoveCustomCharge(index: number): void {
    this.removeCustomCharge.emit(index);
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

  protected columnConfigLabel(col: QuotationGridColumn): string {
    if (col.key === 'weight' && col.source === 'fixed') return 'Weight (line total)';
    if (col.key === 'unitWeight') return 'Unit weight';
    return col.label;
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
    const qty = Number(raw.quantity) || 0;
    const unitWeight = Number(raw.unitWeight) || 0;
    const rate = Number(raw.rate) || 0;
    const weight = unitWeight > 0 ? qty * unitWeight : Number(raw.weight) || 0;
    const calc = recalcLineGroupValues({ ...raw, rate, weight });
    g.patchValue(
      {
        weight,
        amount: calc.amount,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
      },
      { emitEvent: false },
    );
  }

  private bumpRecalc(): void {
    this.recalcTick.update((n) => n + 1);
  }

  private loadCatalogAndColumns(): void {
    forkJoin({
      catalog: this.itemMasterApi.getQuotationCatalog().pipe(take(1)),
      columns: this.quotationsService.getItemGridColumns().pipe(take(1)),
    }).subscribe({
      next: ({ catalog, columns }) => {
        this.catalogItems.set(catalog.items);
        const dynamic = catalogColumnsToGridColumns(catalog.dynamicColumns);
        this.dynamicGridCols.set(dynamic);
        const saved = (columns.columns as QuotationGridColumn[]) ?? FIXED_QUOTATION_GRID_COLUMNS;
        this.columns.set(mergeQuotationGridColumns(saved, dynamic));
      },
      error: () => {
        this.itemMasterApi
          .getQuotationCatalog()
          .pipe(take(1))
          .subscribe({
            next: (catalog) => {
              this.catalogItems.set(catalog.items);
              const dynamic = catalogColumnsToGridColumns(catalog.dynamicColumns);
              this.dynamicGridCols.set(dynamic);
              this.columns.set(mergeQuotationGridColumns(FIXED_QUOTATION_GRID_COLUMNS, dynamic));
            },
            error: () => {
              this.columns.set(FIXED_QUOTATION_GRID_COLUMNS);
              this.toast.error('Could not load item catalog for quotation.');
            },
          });
      },
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

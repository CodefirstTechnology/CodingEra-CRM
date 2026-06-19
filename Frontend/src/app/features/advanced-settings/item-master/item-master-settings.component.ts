import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { canManageSettings } from '../../../core/auth/permission.util';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  ItemAttribute,
  ItemDetail,
  ItemGroup,
  ItemListItem,
  ItemMasterTab,
  ItemStatus,
} from '../../../core/services/item-master/item-master-api.models';
import { ItemMasterHttpService } from '../../../core/services/item-master/item-master-http.service';
import { ToastService } from '../../../core/toast/toast.service';
import {
  ItemMasterAttributesPanelComponent,
  ItemMasterGroupsPanelComponent,
} from './item-master-panels';

type ViewMode = 'list' | 'create' | 'edit' | 'detail';

@Component({
  selector: 'app-item-master-settings',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    ItemMasterGroupsPanelComponent,
    ItemMasterAttributesPanelComponent,
  ],
  templateUrl: './item-master-settings.component.html',
  styleUrl: './item-master-settings.component.scss',
})
export class ItemMasterSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ItemMasterHttpService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly canEdit = signal(false);
  protected readonly activeTab = signal<ItemMasterTab>('items');
  protected readonly viewMode = signal<ViewMode>('list');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly groups = signal<ItemGroup[]>([]);
  protected readonly attributes = signal<ItemAttribute[]>([]);
  protected readonly items = signal<ItemListItem[]>([]);
  protected readonly selectedItem = signal<ItemDetail | null>(null);
  protected readonly quickViewItem = signal<ItemDetail | null>(null);

  protected readonly searchQuery = signal('');
  protected readonly groupFilter = signal<number | ''>('');
  protected readonly statusFilter = signal<ItemStatus | ''>('');
  protected readonly attributeFilterId = signal<number | ''>('');
  protected readonly attributeFilterValue = signal('');
  protected readonly sortBy = signal<'itemName' | 'itemCode' | 'createdAt' | 'updatedAt'>('itemName');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);

  protected readonly editingId = signal<number | null>(null);
  protected readonly variantPanelOpen = signal(false);

  protected readonly variantAttributes = computed(() =>
    this.attributes().filter((a) => a.isVariantAttribute && a.isActive),
  );

  protected readonly groupOptions = computed(() =>
    this.groups()
      .filter((g) => g.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  );

  protected readonly itemForm = this.fb.nonNullable.group({
    itemCode: ['', [Validators.required, Validators.maxLength(64)]],
    itemName: ['', [Validators.required, Validators.maxLength(512)]],
    itemGroupId: [0],
    description: [''],
    steelRate: [0, [Validators.min(0)]],
    status: ['Active' as ItemStatus, Validators.required],
    hasVariants: [false],
    variantAttributeIds: this.fb.nonNullable.control<number[]>([]),
    specifications: this.fb.array([] as ReturnType<typeof this.createSpecGroup>[]),
  });

  protected readonly variantGenerateForm = this.fb.nonNullable.group({
    status: ['Active' as ItemStatus],
    skipExisting: [true],
    attributeRows: this.fb.array([] as ReturnType<typeof this.createGenerateAttrRow>[]),
  });

  ngOnInit(): void {
    this.canEdit.set(canManageSettings(this.auth.user()));
    this.syncItemFormEditability();
    this.syncVariantGenerateFormEditability();
    this.loadMeta();
    this.loadItems();
  }

  protected specsArray(): FormArray {
    return this.itemForm.get('specifications') as FormArray;
  }

  protected generateRowsArray(): FormArray {
    return this.variantGenerateForm.get('attributeRows') as FormArray;
  }

  protected setTab(tab: ItemMasterTab): void {
    this.activeTab.set(tab);
    this.viewMode.set('list');
    this.quickViewItem.set(null);
  }

  protected reloadItems(): void {
    this.page.set(1);
    this.loadItems();
  }

  protected loadItems(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const attrFilters: Record<string, string> = {};
    const attrId = this.attributeFilterId();
    const attrVal = this.attributeFilterValue().trim();
    if (attrId && attrVal) attrFilters[String(attrId)] = attrVal;

    this.api
      .listItems({
        search: this.searchQuery(),
        itemGroupId: this.groupFilter() || undefined,
        status: this.statusFilter() || undefined,
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
        page: this.page(),
        pageSize: this.pageSize(),
        attributeFilters: Object.keys(attrFilters).length ? attrFilters : undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.totalCount.set(res.totalCount);
          this.totalPages.set(res.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('Could not load items.');
        },
      });
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.itemForm.reset({
      itemCode: '',
      itemName: '',
      itemGroupId: 0,
      description: '',
      steelRate: 0,
      status: 'Active',
      hasVariants: false,
      variantAttributeIds: [],
    });
    this.specsArray().clear();
    this.syncItemFormEditability();
    this.viewMode.set('create');
  }

  protected openEdit(item: ItemListItem): void {
    this.loading.set(true);
    this.api.getItem(item.id).subscribe({
      next: (detail) => {
        this.editingId.set(detail.id);
        this.patchItemForm(detail);
        this.syncItemFormEditability();
        this.viewMode.set('edit');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load item.');
      },
    });
  }

  protected openDetail(item: ItemListItem): void {
    this.loading.set(true);
    this.api.getItem(item.id).subscribe({
      next: (detail) => {
        this.selectedItem.set(detail);
        this.viewMode.set('detail');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load item details.');
      },
    });
  }

  protected openQuickView(item: ItemListItem): void {
    this.api.getItem(item.id).subscribe({
      next: (detail) => this.quickViewItem.set(detail),
      error: () => this.toast.error('Could not load quick view.'),
    });
  }

  protected closeQuickView(): void {
    this.quickViewItem.set(null);
  }

  protected backToList(): void {
    this.viewMode.set('list');
    this.selectedItem.set(null);
    this.editingId.set(null);
    this.variantPanelOpen.set(false);
  }

  protected submitItem(): void {
    if (!this.canEdit()) return;
    this.itemForm.markAllAsTouched();
    if (this.itemForm.invalid) return;

    const v = this.itemForm.getRawValue();
    const payload = {
      itemCode: v.itemCode.trim(),
      itemName: v.itemName.trim(),
      itemGroupId: v.itemGroupId > 0 ? v.itemGroupId : null,
      description: v.description.trim(),
      steelRate: Number(v.steelRate) || 0,
      status: v.status,
      hasVariants: v.hasVariants,
      variantAttributeIds: v.hasVariants ? v.variantAttributeIds : [],
      specifications: this.specsArray().controls.map((c, i) => {
        const g = c.getRawValue();
        return {
          id: g.id || undefined,
          specName: g.specName.trim(),
          specValue: g.specValue.trim(),
          sortOrder: i,
        };
      }).filter((s) => s.specName),
    };

    this.saving.set(true);
    const id = this.editingId();
    const req = id ? this.api.updateItem(id, payload) : this.api.createItem(payload);
    req.subscribe({
      next: (detail) => {
        this.saving.set(false);
        this.toast.success(id ? 'Item updated.' : 'Item created.');
        if (detail.hasVariants) {
          this.selectedItem.set(detail);
          this.viewMode.set('detail');
        } else {
          this.backToList();
        }
        this.loadItems();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.error ?? 'Could not save item.';
        this.toast.error(msg);
      },
    });
  }

  protected deleteItem(item: ItemListItem): void {
    if (!this.canEdit() || !confirm(`Delete item "${item.itemName}"?`)) return;
    this.api.deleteItem(item.id).subscribe({
      next: () => {
        this.toast.success('Item deleted.');
        if (this.selectedItem()?.id === item.id) this.backToList();
        this.loadItems();
      },
      error: (err) => {
        this.toast.error(err?.error?.error ?? 'Could not delete item.');
      },
    });
  }

  protected toggleVariantAttr(attrId: number, checked: boolean): void {
    const current = [...this.itemForm.controls.variantAttributeIds.value];
    if (checked && !current.includes(attrId)) current.push(attrId);
    if (!checked) {
      const idx = current.indexOf(attrId);
      if (idx >= 0) current.splice(idx, 1);
    }
    this.itemForm.controls.variantAttributeIds.setValue(current);
  }

  protected isVariantAttrSelected(attrId: number): boolean {
    return this.itemForm.controls.variantAttributeIds.value.includes(attrId);
  }

  protected addSpec(prefill?: { specName: string; specValue: string }): void {
    this.specsArray().push(this.createSpecGroup(prefill));
  }

  protected removeSpec(index: number): void {
    this.specsArray().removeAt(index);
  }

  protected openVariantGenerator(): void {
    const item = this.selectedItem();
    if (!item?.hasVariants) return;
    this.generateRowsArray().clear();
    for (const ta of item.templateAttributes) {
      const attr = this.attributes().find((a) => a.id === ta.attributeId);
      this.generateRowsArray().push(this.createGenerateAttrRow(attr));
    }
    this.syncVariantGenerateFormEditability();
    this.variantPanelOpen.set(true);
  }

  protected addGenerateRow(): void {
    this.generateRowsArray().push(this.createGenerateAttrRow());
  }

  protected removeGenerateRow(index: number): void {
    this.generateRowsArray().removeAt(index);
  }

  protected submitGenerateVariants(): void {
    const item = this.selectedItem();
    if (!item || !this.canEdit()) return;

    const rows = this.generateRowsArray().controls.map((c) => {
      const v = c.getRawValue();
      const values = String(v.valuesText)
        .split(/[,;\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      return { attributeId: Number(v.attributeId), values };
    }).filter((r) => r.attributeId > 0 && r.values.length > 0);

    if (rows.length === 0) {
      this.toast.error('Add at least one attribute with values.');
      return;
    }

    const v = this.variantGenerateForm.getRawValue();
    this.saving.set(true);
    this.api
      .generateVariants(item.id, {
        attributes: rows,
        status: v.status,
        skipExisting: v.skipExisting,
      })
      .subscribe({
        next: (detail) => {
          this.saving.set(false);
          this.selectedItem.set(detail);
          this.variantPanelOpen.set(false);
          this.toast.success('Variants generated.');
          this.loadItems();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(err?.error?.error ?? 'Could not generate variants.');
        },
      });
  }

  protected deleteVariant(variantId: number): void {
    const item = this.selectedItem();
    if (!item || !this.canEdit() || !confirm('Delete this variant?')) return;
    this.api.deleteVariant(item.id, variantId).subscribe({
      next: () => {
        this.api.getItem(item.id).subscribe({
          next: (detail) => {
            this.selectedItem.set(detail);
            this.loadItems();
            this.toast.success('Variant deleted.');
          },
        });
      },
      error: (err) => this.toast.error(err?.error?.error ?? 'Could not delete variant.'),
    });
  }

  protected onSearchInput(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected onGroupFilter(ev: Event): void {
    const val = (ev.target as HTMLSelectElement).value;
    this.groupFilter.set(val ? Number(val) : '');
    this.reloadItems();
  }

  protected onStatusFilter(ev: Event): void {
    this.statusFilter.set((ev.target as HTMLSelectElement).value as ItemStatus | '');
    this.reloadItems();
  }

  protected onAttributeFilterId(ev: Event): void {
    const val = (ev.target as HTMLSelectElement).value;
    this.attributeFilterId.set(val ? Number(val) : '');
  }

  protected applyAttributeFilter(): void {
    this.reloadItems();
  }

  protected toggleSort(field: 'itemName' | 'itemCode' | 'createdAt' | 'updatedAt'): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('asc');
    }
    this.loadItems();
  }

  protected goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    this.loadItems();
  }

  protected fieldInvalid(name: 'itemCode' | 'itemName'): boolean {
    const c = this.itemForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  protected onMetaChanged(): void {
    this.loadMeta();
  }

  private loadMeta(): void {
    this.api.listGroups(true).subscribe({
      next: (rows) => this.groups.set(rows),
      error: () => {},
    });
    this.api.listAttributes(true).subscribe({
      next: (rows) => this.attributes.set(rows),
      error: () => {},
    });
  }

  private patchItemForm(detail: ItemDetail): void {
    this.itemForm.patchValue({
      itemCode: detail.itemCode,
      itemName: detail.itemName,
      itemGroupId: detail.itemGroupId ?? 0,
      description: detail.description,
      steelRate: detail.steelRate,
      status: detail.status,
      hasVariants: detail.hasVariants,
      variantAttributeIds: detail.templateAttributes.map((t) => t.attributeId),
    });
    this.specsArray().clear();
    for (const s of detail.specifications) {
      this.specsArray().push(this.createSpecGroup({ specName: s.specName, specValue: s.specValue, id: s.id }));
    }
  }

  private createSpecGroup(prefill?: { id?: number; specName: string; specValue: string }) {
    return this.fb.nonNullable.group({
      id: [prefill?.id ?? 0],
      specName: [prefill?.specName ?? '', Validators.required],
      specValue: [prefill?.specValue ?? ''],
    });
  }

  private createGenerateAttrRow(attr?: ItemAttribute) {
    return this.fb.nonNullable.group({
      attributeId: [attr?.id ?? 0, Validators.required],
      valuesText: [''],
    });
  }

  private syncItemFormEditability(): void {
    if (this.canEdit()) {
      this.itemForm.enable({ emitEvent: false });
    } else {
      this.itemForm.disable({ emitEvent: false });
    }
  }

  private syncVariantGenerateFormEditability(): void {
    if (this.canEdit()) {
      this.variantGenerateForm.enable({ emitEvent: false });
    } else {
      this.variantGenerateForm.disable({ emitEvent: false });
    }
  }
}

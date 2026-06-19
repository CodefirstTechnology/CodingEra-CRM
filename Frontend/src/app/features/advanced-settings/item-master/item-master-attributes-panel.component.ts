import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ItemAttribute, ItemAttributeValueType } from '../../../core/services/item-master/item-master-api.models';
import { ItemMasterHttpService } from '../../../core/services/item-master/item-master-http.service';
import { ToastService } from '../../../core/toast/toast.service';

@Component({
  selector: 'app-item-master-attributes-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './item-master-attributes-panel.component.html',
  styleUrl: './item-master-attributes-panel.component.scss',
})
export class ItemMasterAttributesPanelComponent implements OnInit {
  readonly canEdit = input(false);
  readonly changed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ItemMasterHttpService);
  private readonly toast = inject(ToastService);

  protected readonly attributes = signal<ItemAttribute[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly formOpen = signal(false);

  protected readonly valueTypes: ItemAttributeValueType[] = ['Text', 'Number', 'Select'];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    code: ['', Validators.maxLength(64)],
    valueType: ['Text' as ItemAttributeValueType],
    isVariantAttribute: [true],
    sortOrder: [0],
    isActive: [true],
    values: this.fb.array([] as ReturnType<typeof this.createValueGroup>[]),
  });

  ngOnInit(): void {
    this.load();
  }

  protected valuesArray(): FormArray {
    return this.form.get('values') as FormArray;
  }

  protected load(): void {
    this.loading.set(true);
    this.api.listAttributes().subscribe({
      next: (rows) => {
        this.attributes.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load attributes.');
      },
    });
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.formOpen.set(true);
    this.form.reset({
      name: '',
      code: '',
      valueType: 'Text',
      isVariantAttribute: true,
      sortOrder: 0,
      isActive: true,
    });
    this.valuesArray().clear();
  }

  protected startEdit(a: ItemAttribute): void {
    this.editingId.set(a.id);
    this.formOpen.set(true);
    this.form.patchValue({
      name: a.name,
      code: a.code,
      valueType: a.valueType,
      isVariantAttribute: a.isVariantAttribute,
      sortOrder: a.sortOrder,
      isActive: a.isActive,
    });
    this.valuesArray().clear();
    for (const v of a.values) {
      this.valuesArray().push(this.createValueGroup({ id: v.id, value: v.value, sortOrder: v.sortOrder, isActive: v.isActive }));
    }
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.formOpen.set(false);
    this.form.reset({
      name: '',
      code: '',
      valueType: 'Text',
      isVariantAttribute: true,
      sortOrder: 0,
      isActive: true,
    });
    this.valuesArray().clear();
  }

  protected addValue(): void {
    this.valuesArray().push(this.createValueGroup());
  }

  protected removeValue(index: number): void {
    this.valuesArray().removeAt(index);
  }

  protected submit(): void {
    if (!this.canEdit()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const payload = {
      name: v.name.trim(),
      code: v.code.trim(),
      valueType: v.valueType,
      isVariantAttribute: v.isVariantAttribute,
      sortOrder: v.sortOrder,
      isActive: v.isActive,
      values: this.valuesArray().controls.map((c, i) => {
        const row = c.getRawValue();
        return {
          id: row.id || undefined,
          value: row.value.trim(),
          sortOrder: row.sortOrder ?? i,
          isActive: row.isActive,
        };
      }).filter((x) => x.value),
    };

    this.saving.set(true);
    const id = this.editingId();
    const req = id ? this.api.updateAttribute(id, payload) : this.api.createAttribute(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(id ? 'Attribute updated.' : 'Attribute created.');
        this.cancelEdit();
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Could not save attribute.');
      },
    });
  }

  protected deleteAttribute(a: ItemAttribute): void {
    if (!this.canEdit() || !confirm(`Delete attribute "${a.name}"?`)) return;
    this.api.deleteAttribute(a.id).subscribe({
      next: () => {
        this.toast.success('Attribute deleted.');
        this.load();
        this.changed.emit();
      },
      error: (err) => this.toast.error(err?.error?.error ?? 'Could not delete attribute.'),
    });
  }

  private createValueGroup(prefill?: { id?: number; value: string; sortOrder: number; isActive: boolean }) {
    return this.fb.nonNullable.group({
      id: [prefill?.id ?? 0],
      value: [prefill?.value ?? '', Validators.required],
      sortOrder: [prefill?.sortOrder ?? 0],
      isActive: [prefill?.isActive ?? true],
    });
  }
}

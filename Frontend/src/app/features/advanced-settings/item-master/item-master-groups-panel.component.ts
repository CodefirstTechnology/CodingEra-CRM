import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ItemGroup } from '../../../core/services/item-master/item-master-api.models';
import { ItemMasterHttpService } from '../../../core/services/item-master/item-master-http.service';
import { ToastService } from '../../../core/toast/toast.service';

@Component({
  selector: 'app-item-master-groups-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './item-master-groups-panel.component.html',
  styleUrl: './item-master-groups-panel.component.scss',
})
export class ItemMasterGroupsPanelComponent implements OnInit {
  readonly canEdit = input(false);
  readonly changed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ItemMasterHttpService);
  private readonly toast = inject(ToastService);

  protected readonly groups = signal<ItemGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly formOpen = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(256)]],
    parentId: [0],
    description: [''],
    sortOrder: [0],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.listGroups().subscribe({
      next: (rows) => {
        this.groups.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load item groups.');
      },
    });
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.formOpen.set(true);
    this.form.reset({ name: '', parentId: 0, description: '', sortOrder: 0, isActive: true });
  }

  protected startEdit(g: ItemGroup): void {
    this.editingId.set(g.id);
    this.formOpen.set(true);
    this.form.patchValue({
      name: g.name,
      parentId: g.parentId ?? 0,
      description: g.description,
      sortOrder: g.sortOrder,
      isActive: g.isActive,
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.formOpen.set(false);
    this.form.reset({ name: '', parentId: 0, description: '', sortOrder: 0, isActive: true });
  }

  protected submit(): void {
    if (!this.canEdit()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const payload = {
      name: v.name.trim(),
      parentId: v.parentId > 0 ? v.parentId : null,
      description: v.description.trim(),
      sortOrder: v.sortOrder,
      isActive: v.isActive,
    };

    this.saving.set(true);
    const id = this.editingId();
    const req = id ? this.api.updateGroup(id, payload) : this.api.createGroup(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(id ? 'Group updated.' : 'Group created.');
        this.cancelEdit();
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Could not save group.');
      },
    });
  }

  protected deleteGroup(g: ItemGroup): void {
    if (!this.canEdit() || !confirm(`Delete group "${g.name}"?`)) return;
    this.api.deleteGroup(g.id).subscribe({
      next: () => {
        this.toast.success('Group deleted.');
        this.load();
        this.changed.emit();
      },
      error: (err) => this.toast.error(err?.error?.error ?? 'Could not delete group.'),
    });
  }

  protected parentOptions(currentId: number | null): ItemGroup[] {
    return this.groups().filter((g) => g.id !== currentId && g.isActive);
  }
}

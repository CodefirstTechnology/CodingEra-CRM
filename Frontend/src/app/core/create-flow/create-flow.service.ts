import { computed, Injectable, signal } from '@angular/core';
import type { CreateEntityKind } from './create-entity-kind';

const FORM_TITLES: Record<CreateEntityKind, string> = {
  lead: 'Create New Lead',
  deal: 'Create New Deal',
  contact: 'Create New Contact',
  organization: 'Create New Organization',
  task: 'Create New Task',
  callLog: 'Create New Call Log',
};

@Injectable({ providedIn: 'root' })
export class CreateFlowService {
  readonly pickerOpen = signal(false);
  readonly formKind = signal<CreateEntityKind | null>(null);

  readonly formModalOpen = computed(() => this.formKind() !== null);

  readonly formTitle = computed(() => {
    const k = this.formKind();
    return k ? FORM_TITLES[k] : '';
  });

  openPicker(): void {
    this.formKind.set(null);
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  /** From picker: close menu and open the entity form. */
  selectEntity(kind: CreateEntityKind): void {
    this.pickerOpen.set(false);
    this.formKind.set(kind);
  }

  closeFormModal(): void {
    this.formKind.set(null);
  }

  closeAll(): void {
    this.pickerOpen.set(false);
    this.formKind.set(null);
  }
}

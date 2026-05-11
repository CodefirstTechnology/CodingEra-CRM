import { computed, Injectable, signal } from '@angular/core';
import type { CreateEntityKind } from './create-entity-kind';

/** When opening the call-log form from a lead or deal, pre-fill and associate the logged call. */
export interface CallLogFormContext {
  relatedLeadId?: string;
  relatedDealId?: string;
  contactName?: string;
  phoneNumber?: string;
}

/** When opening the task form from a lead or deal, associate the new task with that record. */
export interface TaskFormContext {
  relatedLeadId?: string;
  relatedDealId?: string;
}

/** When opening the note form from a lead or deal, pre-fill record and associate the saved note. */
export interface NoteFormContext {
  relatedLeadId?: string;
  /** Display name shown on `Lead · …` line */
  leadRelatedName?: string;
  relatedDealId?: string;
  dealRelatedName?: string;
}

const FORM_TITLES: Record<CreateEntityKind, string> = {
  lead: 'Create New Lead',
  deal: 'Create New Deal',
  contact: 'Create New Contact',
  organization: 'Create New Organization',
  task: 'Create New Task',
  callLog: 'Create New Call Log',
  note: 'Create New Note',
};

@Injectable({ providedIn: 'root' })
export class CreateFlowService {
  readonly pickerOpen = signal(false);
  readonly formKind = signal<CreateEntityKind | null>(null);

  /** Set when opening the call-log form from a lead. Cleared when the modal closes. */
  readonly callLogFormContext = signal<CallLogFormContext | null>(null);

  /** Set when opening the task form from a lead. Cleared when the modal closes. */
  readonly taskFromLeadFormContext = signal<TaskFormContext | null>(null);

  /** Set when opening the note form from a lead. Cleared when the modal closes. */
  readonly noteFromLeadFormContext = signal<NoteFormContext | null>(null);

  readonly formModalOpen = computed(() => this.formKind() !== null);

  readonly formTitle = computed(() => {
    const k = this.formKind();
    return k ? FORM_TITLES[k] : '';
  });

  openPicker(): void {
    this.formKind.set(null);
    this.callLogFormContext.set(null);
    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  /** From picker: close menu and open the entity form. */
  selectEntity(
    kind: CreateEntityKind,
    options?: {
      callLogFromLead?: CallLogFormContext;
      taskFromLead?: TaskFormContext;
      noteFromLead?: NoteFormContext;
    },
  ): void {
    this.pickerOpen.set(false);
    this.callLogFormContext.set(kind === 'callLog' && options?.callLogFromLead ? options.callLogFromLead : null);
    this.taskFromLeadFormContext.set(kind === 'task' && options?.taskFromLead ? options.taskFromLead : null);
    this.noteFromLeadFormContext.set(kind === 'note' && options?.noteFromLead ? options.noteFromLead : null);
    this.formKind.set(kind);
  }

  closeFormModal(): void {
    this.formKind.set(null);
    this.callLogFormContext.set(null);
    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
  }

  closeAll(): void {
    this.pickerOpen.set(false);
    this.formKind.set(null);
    this.callLogFormContext.set(null);
    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
  }
}

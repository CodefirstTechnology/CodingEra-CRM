import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CreateEntityKind } from './create-entity-kind';

/** When opening the task form from a lead or deal, associate the new task with that record. */
export interface TaskFormContext {
  relatedLeadId?: string;
  relatedDealId?: string;
  /** Lead/deal owner (`users.id`) — task assignee is forced to this user. */
  recordOwnerUserId?: string;
}

/** When opening the note form from a lead or deal, pre-fill record and associate the saved note. */
export interface NoteFormContext {
  relatedLeadId?: string;
  /** Display name shown on `Lead · …` line */
  leadRelatedName?: string;
  relatedDealId?: string;
  dealRelatedName?: string;
  /** Lead/deal owner (`users.id`) — note author is forced to this user. */
  recordOwnerUserId?: string;
}

const FORM_TITLES: Record<CreateEntityKind, string> = {
  lead: 'Create New Lead',
  deal: 'Create New Deal',
  contact: 'Create New Contact',
  organization: 'Create New Organization',
  task: 'Create New Task',
  note: 'Create New Note',
};

const LIST_ROUTES: Record<CreateEntityKind, string> = {
  lead: '/leads',
  deal: '/deals',
  contact: '/contacts',
  organization: '/organizations',
  task: '/tasks',
  note: '/notes',
};

@Injectable({ providedIn: 'root' })
export class CreateFlowService {
  private readonly router = inject(Router);
  readonly pickerOpen = signal(false);
  readonly formKind = signal<CreateEntityKind | null>(null);

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
    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  /**
   * From picker or quick actions: open the list-page master form, or the shell task/note modal
   * when created in context of a lead/deal record.
   */
  selectEntity(
    kind: CreateEntityKind,
    options?: {
      taskFromLead?: TaskFormContext;
      noteFromLead?: NoteFormContext;
    },
  ): void {
    this.pickerOpen.set(false);

    const taskCtx = kind === 'task' && options?.taskFromLead ? options.taskFromLead : null;
    const noteCtx = kind === 'note' && options?.noteFromLead ? options.noteFromLead : null;
    if (taskCtx || noteCtx) {
      this.taskFromLeadFormContext.set(taskCtx);
      this.noteFromLeadFormContext.set(noteCtx);
      this.formKind.set(kind);
      return;
    }

    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
    this.formKind.set(null);
    void this.router.navigate([LIST_ROUTES[kind]], { queryParams: { create: '1' } });
  }

  closeFormModal(): void {
    this.formKind.set(null);
    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
  }

  closeAll(): void {
    this.pickerOpen.set(false);
    this.formKind.set(null);
    this.taskFromLeadFormContext.set(null);
    this.noteFromLeadFormContext.set(null);
  }
}

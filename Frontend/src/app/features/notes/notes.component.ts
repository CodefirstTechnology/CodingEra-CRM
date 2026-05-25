import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { NotesService } from '../../core/services/notes.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { createIdSelection } from '../../shared/utils/selection-manager';
import { resolveNoteRecordActivityLink } from '../../shared/utils/entity-record-nav.util';
import { formatDealRecordLabel, formatLeadRecordLabel } from '../../shared/utils/activity-entity-display.util';

export type NoteRelatedType = 'lead' | 'deal' | 'contact' | 'organization';
export type NoteVisibility = 'team' | 'private';

export interface NoteRow {
  id: string;
  title: string;
  relatedType: NoteRelatedType;
  relatedName: string;
  /** Optional CRM entity id when backend provides it. */
  relatedId?: string;
  visibility: NoteVisibility;
  body: string;
  author: string;
  /** Backend author / `author_id` when returned by API. */
  authorUserId?: string;
  /** `notes.updated_by` — user who last updated the note. */
  updatedByUserId?: string;
  /** Display name from users table (`updated_by`, fallback `author_id`). */
  assignedBy?: string;
  when: string;
  bodyPreview?: string;
  /** Full body for edit round-trip. */
  bodyStorage?: string;
  /** When created from lead detail — used to scope notes on the lead. */
  relatedLeadId?: string;
  /** Resolved from `leads` via `related_lead_id` (first + last name). */
  relatedLeadName?: string;
  /** When created from deal detail — used to scope notes on the deal. */
  relatedDealId?: string;
  /** Resolved from deal `firstName` + `lastName`. */
  relatedDealName?: string;
}

@Component({
  selector: 'app-notes',
  imports: [ReactiveFormsModule, CrmSelectionBarComponent, RouterLink],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly notesService = inject(NotesService);
  private readonly toast = inject(ToastService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);
  protected readonly rows = signal<NoteRow[]>([]);

  protected readonly relatedTypeOptions = [
    { value: 'lead', label: 'Lead' },
    { value: 'deal', label: 'Deal' },
    { value: 'contact', label: 'Contact' },
    { value: 'organization', label: 'Organization' },
  ] as const;

  private readonly relatedTypeLabels: Record<string, string> = {
    lead: 'Lead',
    deal: 'Deal',
    contact: 'Contact',
    organization: 'Organization',
  };

  protected readonly noteForm = this.fb.nonNullable.group({
    relatedType: ['deal', Validators.required],
    relatedName: ['', [Validators.required, Validators.maxLength(200)]],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    body: ['', [Validators.required, Validators.maxLength(8000)]],
    visibility: ['team', Validators.required],
  });

  constructor() {
    this.refreshNotes();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'note') return;
      this.refreshNotes();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshNotes(): void {
    this.userScope
      .listNotes()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
  );

  private clearEditQuery(): void {
    this.lastRouteEdit = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
    });
  }

  protected toggleRow(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.sel.toggle(id);
  }

  protected toggleSelectAll(): void {
    this.sel.toggleSelectAll(this.rows().map((r) => r.id));
  }

  protected isRowSelected(id: string): boolean {
    return this.sel.isSelected(id);
  }

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.noteForm.reset({
      relatedType: 'deal',
      relatedName: '',
      title: '',
      body: '',
      visibility: 'team',
    });
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
    this.noteForm.reset({
      relatedType: 'deal',
      relatedName: '',
      title: '',
      body: '',
      visibility: 'team',
    });
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.notesService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        const body = row.body ?? '';
        this.noteForm.patchValue({
          relatedType: row.relatedType,
          relatedName: row.relatedName,
          title: row.title,
          body,
          visibility: row.visibility,
        });
        this.formOpen.set(true);
      });
  }

  protected onBulkEdit(): void {
    const ids = this.sel.selectedItems();
    if (ids.length !== 1) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: ids[0] },
      queryParamsHandling: 'merge',
    });
    this.beginEditFromRoute(ids[0]);
  }

  protected onBulkDelete(): void {
    const ids = this.sel.selectedItems();
    if (ids.length === 0) return;
    forkJoin(ids.map((sid) => this.notesService.delete(Number(sid)).pipe(take(1)))).subscribe({
      next: () => {
        this.sel.clear();
        this.refreshNotes();
        const n = ids.length;
        this.toast.success(n === 1 ? 'Note deleted.' : `${n} notes deleted.`);
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected submitNote(): void {
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }
    const v = this.noteForm.getRawValue();
    const body = v.body.trim();
    const bodyPreview = body.length > 140 ? `${body.slice(0, 140)}…` : body;

    const payload: Omit<NoteRow, 'id'> = {
      title: v.title.trim(),
      relatedType: v.relatedType as NoteRelatedType,
      relatedName: v.relatedName.trim(),
      visibility: v.visibility as NoteVisibility,
      body,
      author: 'You',
      when: 'Just now',
      bodyPreview,
    };

    const editId = this.editingNumericId();
    const done = () => {
      this.sel.clear();
      this.refreshNotes();
      this.closeForm();
    };

    if (editId != null) {
      this.notesService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Note updated.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    } else {
      this.notesService
        .create(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.toast.success('Note created.');
            done();
          },
          error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
        });
    }
  }

  protected deleteNote(row: NoteRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.notesService
      .delete(id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.sel.removeId(row.id);
          this.refreshNotes();
          this.toast.success('Note deleted.');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }

  protected noteRecordActivityLink(row: NoteRow) {
    return resolveNoteRecordActivityLink(row);
  }

  protected noteRelatedLabel(row: NoteRow): string {
    const suffix = row.visibility === 'private' ? ' · Private' : '';
    if (row.relatedType === 'lead') {
      const name = row.relatedLeadName?.trim() || row.relatedName?.trim() || '—';
      return `${formatLeadRecordLabel(name)}${suffix}`;
    }
    if (row.relatedType === 'deal') {
      const name = row.relatedDealName?.trim() || row.relatedName?.trim() || '—';
      return `${formatDealRecordLabel(name)}${suffix}`;
    }
    const label = this.relatedTypeLabels[row.relatedType] ?? row.relatedType;
    const recordName = row.relatedName?.trim() || '—';
    return `${label} · ${recordName}${suffix}`;
  }

  protected fieldInvalid(name: 'relatedType' | 'relatedName' | 'title' | 'body' | 'visibility'): boolean {
    const c = this.noteForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
}

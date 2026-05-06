import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { NotesService } from '../../core/services/notes.service';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { createIdSelection } from '../../shared/utils/selection-manager';

export interface NoteRow {
  id: string;
  title: string;
  record: string;
  author: string;
  when: string;
  bodyPreview?: string;
  /** Full body for edit round-trip (local/mock). */
  bodyStorage?: string;
}

@Component({
  selector: 'app-notes',
  imports: [ReactiveFormsModule, CrmSelectionBarComponent],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notesService = inject(NotesService);
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

  private readonly labelToRelatedType: Record<string, string> = {
    Lead: 'lead',
    Deal: 'deal',
    Contact: 'contact',
    Organization: 'organization',
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
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshNotes(): void {
    this.notesService
      .getAll()
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

  private parseRecord(record: string): { relatedType: string; relatedName: string; visibility: 'team' | 'private' } {
    let vis: 'team' | 'private' = 'team';
    let r = record;
    if (r.endsWith(' · Private')) {
      vis = 'private';
      r = r.slice(0, -' · Private'.length);
    }
    const idx = r.indexOf(' · ');
    if (idx < 0) {
      return { relatedType: 'deal', relatedName: r.trim(), visibility: vis };
    }
    const label = r.slice(0, idx).trim();
    const name = r.slice(idx + 3).trim();
    return {
      relatedType: this.labelToRelatedType[label] ?? 'deal',
      relatedName: name,
      visibility: vis,
    };
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
        const parsed = this.parseRecord(row.record);
        const body = row.bodyStorage ?? row.bodyPreview?.replace(/…$/, '') ?? '';
        this.noteForm.patchValue({
          relatedType: parsed.relatedType,
          relatedName: parsed.relatedName,
          title: row.title,
          body,
          visibility: parsed.visibility,
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
    forkJoin(ids.map((sid) => this.notesService.delete(Number(sid)).pipe(take(1)))).subscribe(() => {
      this.sel.clear();
      this.refreshNotes();
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
    const typeLabel = this.relatedTypeLabels[v.relatedType] ?? v.relatedType;
    const name = v.relatedName.trim();
    const record =
      v.visibility === 'private'
        ? `${typeLabel} · ${name} · Private`
        : `${typeLabel} · ${name}`;

    const body = v.body.trim();
    const bodyPreview = body.length > 140 ? `${body.slice(0, 140)}…` : body;

    const payload: Omit<NoteRow, 'id'> = {
      title: v.title.trim(),
      record,
      author: 'You',
      when: 'Just now',
      bodyPreview,
      bodyStorage: body,
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
        .subscribe(() => done());
    } else {
      this.notesService
        .create(payload)
        .pipe(take(1))
        .subscribe(() => done());
    }
  }

  protected deleteNote(row: NoteRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.notesService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.sel.removeId(row.id);
        this.refreshNotes();
      });
  }

  protected fieldInvalid(name: 'relatedType' | 'relatedName' | 'title' | 'body' | 'visibility'): boolean {
    const c = this.noteForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
}

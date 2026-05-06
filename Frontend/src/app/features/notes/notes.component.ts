import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { NotesService } from '../../core/services/notes.service';

export interface NoteRow {
  id: string;
  title: string;
  record: string;
  author: string;
  when: string;
  /** Preview of full note body (new rows from the form). */
  bodyPreview?: string;
}

@Component({
  selector: 'app-notes',
  imports: [ReactiveFormsModule],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notesService = inject(NotesService);

  protected readonly formOpen = signal(false);
  protected readonly rows = signal<NoteRow[]>([]);

  constructor() {
    this.refreshNotes();
  }

  private refreshNotes(): void {
    this.notesService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

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

  protected openForm(): void {
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.noteForm.reset({
      relatedType: 'deal',
      relatedName: '',
      title: '',
      body: '',
      visibility: 'team',
    });
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
    };
    this.notesService
      .create(payload)
      .pipe(take(1))
      .subscribe(() => {
        this.refreshNotes();
        this.closeForm();
      });
  }

  protected deleteNote(row: NoteRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.notesService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => this.refreshNotes());
  }

  protected fieldInvalid(name: 'relatedType' | 'relatedName' | 'title' | 'body' | 'visibility'): boolean {
    const c = this.noteForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
}

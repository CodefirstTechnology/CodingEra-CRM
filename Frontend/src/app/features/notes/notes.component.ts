import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface NoteRow {
  id: string;
  title: string;
  record: string;
  author: string;
  when: string;
  /** Preview of full note body (new rows from the form). */
  bodyPreview?: string;
}

const SEED: NoteRow[] = [
  {
    id: '1',
    title: 'Follow up after demo — interested in enterprise tier',
    record: 'Lead · Northwind Traders',
    author: 'Jordan Doe',
    when: 'Today, 8:42 AM',
  },
  {
    id: '2',
    title: 'Legal requested MSA redlines before signature',
    record: 'Deal · Acme Corp',
    author: 'Sam Lee',
    when: 'Yesterday, 4:18 PM',
  },
  {
    id: '3',
    title: 'Budget confirmed for Q1; waiting on procurement',
    record: 'Organization · Contoso Ltd',
    author: 'Maria Chen',
    when: 'Mon, Jan 27',
  },
  {
    id: '4',
    title: 'Call summary: renewal discussion, no blockers',
    record: 'Contact · Alex Morgan',
    author: 'Jordan Doe',
    when: 'Mon, Jan 27',
  },
  {
    id: '5',
    title: 'Competitor mentioned — position on integrations',
    record: 'Deal · Fabrikam Inc',
    author: 'Alex Rivera',
    when: 'Fri, Jan 24',
  },
];

@Component({
  selector: 'app-notes',
  imports: [ReactiveFormsModule],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent {
  private readonly fb = inject(FormBuilder);

  protected readonly formOpen = signal(false);
  protected readonly rows = signal<NoteRow[]>(SEED);

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

    const newRow: NoteRow = {
      id: `n-${Date.now()}`,
      title: v.title.trim(),
      record,
      author: 'You',
      when: 'Just now',
      bodyPreview,
    };
    this.rows.update((list) => [newRow, ...list]);
    this.closeForm();
  }

  protected fieldInvalid(name: 'relatedType' | 'relatedName' | 'title' | 'body' | 'visibility'): boolean {
    const c = this.noteForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
}

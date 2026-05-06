import { Component, effect, input, output, signal, untracked } from '@angular/core';

export interface CrmAssignOption {
  id: string;
  label: string;
  initials: string;
}

@Component({
  selector: 'app-crm-assign-picker',
  standalone: true,
  templateUrl: './crm-assign-picker.component.html',
  styleUrl: './crm-assign-picker.component.scss',
})
export class CrmAssignPickerComponent {
  open = input(false);
  title = input('Assign to');
  options = input<CrmAssignOption[]>([]);
  /** Preferred option id when dialog opens (e.g. first selected row's owner). */
  selectedId = input<string>('');

  picked = output<string>();
  closed = output<void>();

  protected readonly choice = signal('');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const opts = this.options();
      const preferred = this.selectedId();
      untracked(() => {
        const next =
          preferred && opts.some((o) => o.id === preferred)
            ? preferred
            : (opts[0]?.id ?? '');
        this.choice.set(next);
      });
    });
  }

  protected onSelectChange(ev: Event): void {
    this.choice.set((ev.target as HTMLSelectElement).value);
  }

  protected apply(): void {
    const v = this.choice();
    if (!v) return;
    this.picked.emit(v);
    this.closed.emit();
  }

  protected cancel(): void {
    this.closed.emit();
  }
}

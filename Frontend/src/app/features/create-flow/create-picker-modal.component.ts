import { Component, HostListener, effect, inject, signal, untracked } from '@angular/core';
import type { CreateEntityKind } from '../../core/create-flow/create-entity-kind';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';

@Component({
  selector: 'app-create-picker-modal',
  standalone: true,
  imports: [CrmModalComponent],
  templateUrl: './create-picker-modal.component.html',
  styleUrl: './create-picker-modal.component.scss',
})
export class CreatePickerModalComponent {
  protected readonly flow = inject(CreateFlowService);

  protected readonly options: { kind: CreateEntityKind; label: string }[] = [
    { kind: 'lead', label: 'New Lead' },
    { kind: 'deal', label: 'New Deal' },
    { kind: 'contact', label: 'New Contact' },
    { kind: 'organization', label: 'New Organization' },
    { kind: 'task', label: 'New Task' },
    { kind: 'callLog', label: 'New Call Log' },
  ];

  protected readonly focusedIndex = signal(0);

  constructor() {
    effect(() => {
      if (this.flow.pickerOpen()) {
        untracked(() => this.focusedIndex.set(0));
      }
    });
  }

  protected onDismiss(): void {
    this.flow.closePicker();
  }

  protected select(kind: CreateEntityKind): void {
    this.flow.selectEntity(kind);
  }

  protected isActive(i: number): boolean {
    return this.focusedIndex() === i;
  }

  private moveFocus(delta: number): void {
    if (!this.flow.pickerOpen()) return;
    const len = this.options.length;
    const next = (this.focusedIndex() + delta + len) % len;
    this.focusedIndex.set(next);
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  onArrowDown(ev: Event): void {
    if (!this.flow.pickerOpen()) return;
    ev.preventDefault();
    this.moveFocus(1);
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onArrowUp(ev: Event): void {
    if (!this.flow.pickerOpen()) return;
    ev.preventDefault();
    this.moveFocus(-1);
  }

  @HostListener('document:keydown.home', ['$event'])
  onHome(ev: Event): void {
    if (!this.flow.pickerOpen()) return;
    ev.preventDefault();
    this.focusedIndex.set(0);
  }

  @HostListener('document:keydown.end', ['$event'])
  onEnd(ev: Event): void {
    if (!this.flow.pickerOpen()) return;
    ev.preventDefault();
    this.focusedIndex.set(this.options.length - 1);
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnter(ev: Event): void {
    if (!this.flow.pickerOpen()) return;
    const t = ev.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
      return;
    }
    ev.preventDefault();
    const opt = this.options[this.focusedIndex()];
    if (opt) this.flow.selectEntity(opt.kind);
  }
}

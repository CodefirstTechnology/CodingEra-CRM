import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-crm-modal',
  standalone: true,
  templateUrl: './crm-modal.component.html',
  styleUrl: './crm-modal.component.scss',
})
export class CrmModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** When false, header still shows title but no X — parent may use footer Cancel only */
  readonly showClose = input(true);
  readonly showFooter = input(false);

  readonly dismiss = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly titleId = `crm-modal-title-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly panelClass = computed(() => {
    switch (this.size()) {
      case 'sm':
        return 'crm-modal__panel crm-modal__panel--sm';
      case 'lg':
        return 'crm-modal__panel crm-modal__panel--lg';
      default:
        return 'crm-modal__panel crm-modal__panel--md';
    }
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      queueMicrotask(() => this.panel()?.nativeElement?.focus());
    });
  }

  protected onBackdropClick(): void {
    this.dismiss.emit();
  }

  protected onCloseClick(): void {
    this.dismiss.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open()) return;
    this.dismiss.emit();
  }
}

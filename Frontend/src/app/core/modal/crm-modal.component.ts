import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
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

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  private anchorParent: ParentNode | null = null;
  private anchorNextSibling: ChildNode | null = null;

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
      if (this.open()) {
        this.attachHostToBody();
        queueMicrotask(() => this.panel()?.nativeElement?.focus());
        return;
      }
      this.restoreHostFromBody();
    });

    this.destroyRef.onDestroy(() => this.restoreHostFromBody());
  }

  /** Escape scrollable app shells — fixed positioning must use the viewport. */
  private attachHostToBody(): void {
    const el = this.host.nativeElement;
    if (el.parentNode === this.document.body) return;

    this.anchorParent = el.parentNode;
    this.anchorNextSibling = el.nextSibling;
    this.document.body.appendChild(el);
  }

  private restoreHostFromBody(): void {
    const el = this.host.nativeElement;
    const parent = this.anchorParent;
    if (!parent || el.parentNode !== this.document.body) return;

    if (this.anchorNextSibling && this.anchorNextSibling.parentNode === parent) {
      parent.insertBefore(el, this.anchorNextSibling);
    } else {
      parent.appendChild(el);
    }

    this.anchorParent = null;
    this.anchorNextSibling = null;
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

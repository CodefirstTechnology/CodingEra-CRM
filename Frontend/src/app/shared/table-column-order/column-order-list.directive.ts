import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import type { ColumnReorderEvent } from './column-order.types';

/**
 * Pointer-based vertical reorder (reliable inside scrollable menus).
 * Press and hold the handle, drag up/down, release to drop.
 *
 * Mark rows with `[crmColumnOrderItem]` and handles with `[crmColumnOrderHandle]`.
 */
@Directive({
  selector: '[crmColumnOrderList]',
  standalone: true,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
  },
})
export class ColumnOrderListDirective {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly crmColumnOrderDisabled = input(false);
  readonly crmColumnReordered = output<ColumnReorderEvent>();

  private session: {
    pointerId: number;
    fromIndex: number;
    toIndex: number;
    active: boolean;
    itemEl: HTMLElement;
  } | null = null;

  private readonly onMove = (event: PointerEvent): void => this.onPointerMove(event);
  private readonly onUp = (event: PointerEvent): void => this.onPointerUp(event);
  private readonly onCancel = (event: PointerEvent): void => {
    if (this.session?.pointerId === event.pointerId) {
      this.endSession();
    }
  };

  constructor() {
    this.destroyRef.onDestroy(() => this.endSession());
  }

  onPointerDown(event: PointerEvent): void {
    if (this.crmColumnOrderDisabled() || event.button !== 0) return;

    const handle = (event.target as HTMLElement | null)?.closest?.(
      '[data-crm-column-handle]',
    ) as HTMLElement | null;
    if (!handle || !this.host.nativeElement.contains(handle)) return;

    const item = handle.closest('[data-column-index]') as HTMLElement | null;
    if (!item || !this.host.nativeElement.contains(item)) return;

    const fromIndex = this.readIndex(item);
    if (fromIndex == null) return;

    event.preventDefault();
    event.stopPropagation();
    this.endSession();

    this.session = {
      pointerId: event.pointerId,
      fromIndex,
      toIndex: fromIndex,
      active: false,
      itemEl: item,
    };

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* document listeners still cover move/up */
    }

    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp);
    document.addEventListener('pointercancel', this.onCancel);
  }

  private onPointerMove(event: PointerEvent): void {
    const s = this.session;
    if (!s || event.pointerId !== s.pointerId) return;

    if (!s.active) {
      s.active = true;
      s.itemEl.classList.add('is-dragging');
      this.host.nativeElement.classList.add('is-reordering');
    }

    const el = document.elementFromPoint(event.clientX, event.clientY);
    const over = el?.closest?.('[data-column-index]') as HTMLElement | null;
    if (!over || !this.host.nativeElement.contains(over)) return;

    const toIndex = this.readIndex(over);
    if (toIndex == null) return;

    this.clearDropTargetClass();
    if (toIndex !== s.fromIndex) {
      over.classList.add('is-drop-target');
    }
    s.toIndex = toIndex;
  }

  private onPointerUp(event: PointerEvent): void {
    const s = this.session;
    if (!s || event.pointerId !== s.pointerId) return;

    const { fromIndex, toIndex, active } = s;
    this.endSession();

    if (active && toIndex !== fromIndex) {
      this.crmColumnReordered.emit({ fromIndex, toIndex });
    }
  }

  private endSession(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onCancel);
    this.clearDraggingClass();
    this.clearDropTargetClass();
    this.host.nativeElement.classList.remove('is-reordering');
    this.session = null;
  }

  private readIndex(el: Element): number | null {
    const attr = el.getAttribute('data-column-index');
    if (attr == null || attr === '') return null;
    const n = Number(attr);
    return Number.isFinite(n) ? n : null;
  }

  private clearDraggingClass(): void {
    this.host.nativeElement
      .querySelectorAll('.is-dragging')
      .forEach((node: Element) => node.classList.remove('is-dragging'));
  }

  private clearDropTargetClass(): void {
    this.host.nativeElement
      .querySelectorAll('.is-drop-target')
      .forEach((node: Element) => node.classList.remove('is-drop-target'));
  }
}

/** Marks a row as a reorderable item; bind the list index. */
@Directive({
  selector: '[crmColumnOrderItem]',
  standalone: true,
  host: {
    '[attr.data-column-index]': 'crmColumnOrderItem()',
  },
})
export class ColumnOrderItemDirective {
  readonly crmColumnOrderItem = input.required<number>();
}

/** Marks the press-and-drag handle. */
@Directive({
  selector: '[crmColumnOrderHandle]',
  standalone: true,
  host: {
    '[attr.data-crm-column-handle]': '""',
  },
})
export class ColumnOrderHandleDirective {}

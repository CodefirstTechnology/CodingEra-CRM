import {
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  CRM_PAGINATED_SELECT_PAGE_SIZE,
  type CrmPaginatedSelectOption,
} from './crm-paginated-select.model';

@Component({
  selector: 'app-crm-paginated-select',
  standalone: true,
  templateUrl: './crm-paginated-select.component.html',
  styleUrl: './crm-paginated-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CrmPaginatedSelectComponent),
      multi: true,
    },
  ],
  host: {
    class: 'crm-paginated-select',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class CrmPaginatedSelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly options = input<CrmPaginatedSelectOption[]>([]);
  readonly pageSize = input(CRM_PAGINATED_SELECT_PAGE_SIZE);
  readonly ariaLabel = input('Select option');
  readonly placeholder = input('— Select —');
  /** BEM prefix for detail pages (`lead-detail`, `deal-detail`, …). */
  readonly stylePrefix = input('lead-detail');

  protected readonly open = signal(false);
  protected readonly page = signal(0);
  protected readonly disabled = signal(false);

  private value = '';
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected readonly totalPages = computed(() => {
    const n = this.options().length;
    const size = Math.max(1, this.pageSize());
    return Math.max(1, Math.ceil(n / size));
  });

  protected readonly pageOptions = computed(() => {
    const size = Math.max(1, this.pageSize());
    const start = this.page() * size;
    return this.options().slice(start, start + size);
  });

  protected readonly showPager = computed(() => this.options().length > this.pageSize());

  protected readonly displayLabel = computed(() => {
    const v = this.value?.trim() ?? '';
    if (!v) return this.placeholder();
    const hit = this.options().find((o) => o.value === v);
    return hit?.label ?? v;
  });

  writeValue(value: string | null): void {
    this.value = value ?? '';
    this.syncPageToValue();
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) this.open.set(false);
  }

  protected togglePanel(): void {
    if (this.disabled()) return;
    const next = !this.open();
    this.open.set(next);
    if (next) this.syncPageToValue();
    if (!next) this.onTouched();
  }

  protected selectOption(opt: CrmPaginatedSelectOption): void {
    this.value = opt.value;
    this.onChange(opt.value);
    this.onTouched();
    this.open.set(false);
  }

  protected prevPage(ev: Event): void {
    ev.stopPropagation();
    if (this.page() <= 0) return;
    this.page.update((p) => p - 1);
  }

  protected nextPage(ev: Event): void {
    ev.stopPropagation();
    if (this.page() >= this.totalPages() - 1) return;
    this.page.update((p) => p + 1);
  }

  protected onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const el = this.host.nativeElement;
    if (ev.target instanceof Node && el.contains(ev.target)) return;
    this.open.set(false);
    this.onTouched();
  }

  protected isSelected(opt: CrmPaginatedSelectOption): boolean {
    return (this.value?.trim() ?? '') === opt.value;
  }

  private syncPageToValue(): void {
    const v = this.value?.trim() ?? '';
    if (!v) return;
    const idx = this.options().findIndex((o) => o.value === v);
    if (idx < 0) return;
    const size = Math.max(1, this.pageSize());
    this.page.set(Math.floor(idx / size));
  }
}

import { NgClass } from '@angular/common';
import {
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import {
  CRM_SEARCHABLE_SELECT_DEBOUNCE_MS,
  CRM_SEARCHABLE_SELECT_MIN_LENGTH,
  type CrmSearchableSelectOption,
} from './crm-searchable-select.model';

@Component({
  selector: 'app-crm-searchable-select',
  standalone: true,
  imports: [NgClass],
  templateUrl: './crm-searchable-select.component.html',
  styleUrl: './crm-searchable-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CrmSearchableSelectComponent),
      multi: true,
    },
  ],
  host: {
    class: 'crm-searchable-select',
    '[class.crm-searchable-select--open]': 'open()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class CrmSearchableSelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly placeholder = input('Search…');
  readonly ariaLabel = input('Search and select');
  readonly minLength = input(CRM_SEARCHABLE_SELECT_MIN_LENGTH);
  readonly debounceMs = input(CRM_SEARCHABLE_SELECT_DEBOUNCE_MS);
  readonly controlClass = input('deals__control deals__control--soft');
  readonly searchFn = input.required<(term: string) => Observable<CrmSearchableSelectOption[]>>();

  readonly optionSelected = output<CrmSearchableSelectOption>();

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly options = signal<CrmSearchableSelectOption[]>([]);
  protected readonly query = signal('');
  protected readonly selectedLabel = signal('');
  protected readonly activeIndex = signal(-1);
  protected readonly disabled = signal(false);

  private selectedId = '';
  private pickInProgress = false;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly searchTerms$ = new Subject<string>();
  private searchSub: Subscription | null = null;

  constructor() {
    this.searchSub = this.searchTerms$
      .pipe(
        debounceTime(CRM_SEARCHABLE_SELECT_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((term) => {
          const min = this.minLength();
          if (term.trim().length < min) {
            this.loading.set(false);
            this.options.set([]);
            return of([]);
          }
          this.loading.set(true);
          return this.searchFn()(term.trim());
        }),
      )
      .subscribe({
        next: (rows) => {
          this.options.set(Array.isArray(rows) ? rows : []);
          this.loading.set(false);
          this.activeIndex.set(this.options().length > 0 ? 0 : -1);
        },
        error: () => {
          this.options.set([]);
          this.loading.set(false);
          this.activeIndex.set(-1);
        },
      });
  }

  writeValue(value: string | null): void {
    this.selectedId = value?.trim() ?? '';
    if (!this.selectedId) {
      this.selectedLabel.set('');
    }
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) {
      this.open.set(false);
    }
  }

  protected displayValue(): string {
    if (this.open()) {
      return this.query();
    }
    return this.selectedLabel() || this.query();
  }

  protected onInput(ev: Event): void {
    if (this.disabled()) return;
    const value = (ev.target as HTMLInputElement).value;
    this.query.set(value);
    this.open.set(true);
    if (this.selectedId) {
      this.selectedId = '';
      this.selectedLabel.set('');
      this.onChange('');
    }
    const min = this.minLength();
    if (value.trim().length < min) {
      this.loading.set(false);
      this.options.set([]);
      this.activeIndex.set(-1);
      return;
    }
    this.loading.set(true);
    this.searchTerms$.next(value);
  }

  protected onFocus(): void {
    if (this.disabled()) return;
    this.open.set(true);
    const min = this.minLength();
    const q = this.query().trim();
    if (q.length >= min) {
      this.loading.set(true);
      this.searchTerms$.next(q);
    }
  }

  protected onKeydown(ev: KeyboardEvent): void {
    if (this.disabled()) return;
    const items = this.options();
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (!this.open()) this.open.set(true);
      if (items.length === 0) return;
      this.activeIndex.update((i) => (i + 1) % items.length);
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (items.length === 0) return;
      this.activeIndex.update((i) => (i <= 0 ? items.length - 1 : i - 1));
      return;
    }
    if (ev.key === 'Enter') {
      if (!this.open() || items.length === 0) return;
      ev.preventDefault();
      const idx = this.activeIndex();
      if (idx >= 0 && idx < items.length) {
        this.pickOption(items[idx]);
      }
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.closePanel();
    }
  }

  protected pickOption(opt: CrmSearchableSelectOption, ev?: Event): void {
    if (this.pickInProgress) return;
    this.pickInProgress = true;
    ev?.preventDefault();
    ev?.stopPropagation();
    this.selectedId = opt.id;
    this.selectedLabel.set(opt.label);
    this.query.set('');
    this.onChange(opt.id);
    this.onTouched();
    this.optionSelected.emit(opt);
    this.closePanel(false);
    queueMicrotask(() => {
      const el = this.searchInput()?.nativeElement;
      if (el) {
        el.value = opt.label;
      }
      this.pickInProgress = false;
    });
  }

  protected clearSelection(ev: Event): void {
    ev.stopPropagation();
    if (this.disabled()) return;
    this.selectedId = '';
    this.selectedLabel.set('');
    this.query.set('');
    this.options.set([]);
    this.onChange('');
    this.onTouched();
    this.open.set(true);
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }

  protected closePanel(markTouched = true): void {
    this.open.set(false);
    this.activeIndex.set(-1);
    if (markTouched) {
      this.onTouched();
    }
  }

  protected onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const el = this.host.nativeElement;
    if (ev.target instanceof Node && el.contains(ev.target)) return;
    this.closePanel();
  }

  protected isActive(index: number): boolean {
    return this.activeIndex() === index;
  }

  protected showEmptyState(): boolean {
    return (
      this.open() &&
      !this.loading() &&
      this.query().trim().length >= this.minLength() &&
      this.options().length === 0
    );
  }

  protected showHint(): boolean {
    return this.open() && this.query().trim().length > 0 && this.query().trim().length < this.minLength();
  }

  protected hasSelection(): boolean {
    return !!this.selectedId;
  }

  protected listId(): string {
    return `crm-searchable-list-${this.ariaLabel().trim().replace(/\s+/g, '-').toLowerCase()}`;
  }

  /** Allows parent flows (duplicate hint) to apply a picked record. */
  applySelection(opt: CrmSearchableSelectOption): void {
    this.pickOption(opt);
  }
}

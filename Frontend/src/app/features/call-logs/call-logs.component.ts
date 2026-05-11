import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { CallLogsService } from '../../core/services/call-logs.service';
import { CrmSelectionBarComponent } from '../../shared/components/crm-selection-bar/crm-selection-bar.component';
import { createIdSelection } from '../../shared/utils/selection-manager';

export interface CallLogRow {
  id: string;
  direction: 'Inbound' | 'Outbound';
  phoneNumber: string;
  contactName: string;
  /** ISO datetime string (e.g. from `<input type="datetime-local">` or API). */
  startedAt: string;
  durationSeconds: number;
  outcome: string;
  /** ISO-local datetime for edit form (optional, mock persistence). */
  startedAtIso?: string;
 
  callSummary?: string;
  /** When created from lead detail — used to scope call history on the lead. */
  relatedLeadId?: string;
  /** When created from deal detail — used to scope call history on the deal. */
  relatedDealId?: string;
  summary: string;
  lastModified: string;
}

@Component({
  selector: 'app-call-logs',
  imports: [ReactiveFormsModule, CrmSelectionBarComponent],
  templateUrl: './call-logs.component.html',
  styleUrl: './call-logs.component.scss',
})
export class CallLogsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly callLogsService = inject(CallLogsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sel = createIdSelection();
  protected readonly editingNumericId = signal<number | null>(null);
  private lastRouteEdit = '';

  protected readonly formOpen = signal(false);
  protected readonly rows = signal<CallLogRow[]>([]);

  constructor() {
    this.refreshCallLogs();
    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind !== 'callLog') return;
      this.refreshCallLogs();
    });
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((q) => {
      const edit = q['edit'];
      if (edit != null && edit !== '') {
        this.beginEditFromRoute(String(edit));
      }
    });
  }

  private refreshCallLogs(): void {
    this.callLogsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => this.rows.set(rows));
  }

  protected readonly allSelected = computed(() =>
    this.sel.allSelectedIn(this.rows().map((r) => r.id)),
  );

  protected readonly callForm = this.fb.nonNullable.group({
    direction: ['outbound', Validators.required],
    phoneNumber: ['', [Validators.required, Validators.maxLength(40)]],
    contactName: ['', [Validators.required, Validators.maxLength(200)]],
    startedAt: ['', Validators.required],
    durationMin: [0, [Validators.required, Validators.min(0), Validators.max(99)]],
    durationSec: [0, [Validators.required, Validators.min(0), Validators.max(59)]],
    outcome: ['connected', Validators.required],
    summary: ['', Validators.maxLength(2000)],
  });

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

  protected openForm(): void {
    this.editingNumericId.set(null);
    this.clearEditQuery();
    const p = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    this.callForm.patchValue({
      startedAt: local,
      direction: 'outbound',
      phoneNumber: '',
      contactName: '',
      durationMin: 0,
      durationSec: 0,
      outcome: 'connected',
      summary: '',
    });
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingNumericId.set(null);
    this.clearEditQuery();
  }

  private outcomeCodeFromLabel(label: string): string {
    const map: Record<string, string> = {
      Connected: 'connected',
      Voicemail: 'voicemail',
      'No answer': 'no_answer',
      Busy: 'busy',
      'Wrong number': 'wrong_number',
    };
    return map[label] ?? 'connected';
  }

  private beginEditFromRoute(idStr: string): void {
    if (this.lastRouteEdit === idStr && this.formOpen()) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    this.lastRouteEdit = idStr;
    this.callLogsService
      .getById(id)
      .pipe(take(1))
      .subscribe((row) => {
        if (!row) return;
        this.editingNumericId.set(id);
        const total = Math.max(0, row.durationSeconds);
        const m = Math.min(99, Math.floor(total / 60));
        const s = total % 60;
        const p = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        const fallback = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        this.callForm.patchValue({
          direction: row.direction === 'Inbound' ? 'inbound' : 'outbound',
          phoneNumber: row.phoneNumber,
          contactName: row.contactName,
          startedAt: row.startedAt || fallback,
          durationMin: m,
          durationSec: s,
          outcome: this.outcomeCodeFromLabel(row.outcome),
          summary: row.summary,
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
    forkJoin(ids.map((sid) => this.callLogsService.delete(Number(sid)).pipe(take(1)))).subscribe(() => {
      this.sel.clear();
      this.refreshCallLogs();
    });
  }

  protected onBulkDismiss(): void {
    this.sel.clear();
  }

  protected callListContact(row: CallLogRow): string {
    const sum = row.summary.trim();
    if (!sum.length) return row.contactName;
    return `${row.contactName} · ${sum.slice(0, 48)}${sum.length > 48 ? '…' : ''}`;
  }

  protected callDurationLabel(row: CallLogRow): string {
    const sec = Math.max(0, row.durationSeconds);
    const m = Math.min(99, Math.floor(sec / 60));
    const s = sec % 60;
    return `${this.pad2(m)}:${this.pad2(s)}`;
  }

  protected callWhenLabel(row: CallLogRow): string {
    return this.formatWhen(row.startedAt);
  }

  private formatWhen(isoLocal: string): string {
    const d = new Date(isoLocal);
    if (Number.isNaN(d.getTime())) return 'Just now';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private pad2(n: number): string {
    return String(Math.max(0, Math.min(99, n))).padStart(2, '0');
  }

  private outcomeLabel(code: string): string {
    const map: Record<string, string> = {
      connected: 'Connected',
      voicemail: 'Voicemail',
      no_answer: 'No answer',
      busy: 'Busy',
      wrong_number: 'Wrong number',
    };
    return map[code] ?? code;
  }

  protected submitCall(): void {
    if (this.callForm.invalid) {
      this.callForm.markAllAsTouched();
      return;
    }
    const v = this.callForm.getRawValue();
    const direction: 'Inbound' | 'Outbound' = v.direction === 'inbound' ? 'Inbound' : 'Outbound';
    const mm = Math.max(0, Math.min(99, Number(v.durationMin)));
    const ss = Math.max(0, Math.min(59, Number(v.durationSec)));
    const durationSeconds = mm * 60 + ss;
    const outcome = this.outcomeLabel(v.outcome);
    const summaryTrim = v.summary.trim();

    const payload: Omit<CallLogRow, 'id'> = {
      direction,
      phoneNumber: v.phoneNumber.trim(),
      contactName: v.contactName.trim(),
      startedAt: v.startedAt,
      durationSeconds,
      outcome,
      summary: summaryTrim,
      lastModified: 'Just now',
    };

    const editId = this.editingNumericId();
    const done = () => {
      this.sel.clear();
      this.refreshCallLogs();
      this.closeForm();
    };

    if (editId != null) {
      this.callLogsService
        .update(editId, payload)
        .pipe(take(1))
        .subscribe(() => done());
    } else {
      this.callLogsService
        .create(payload)
        .pipe(take(1))
        .subscribe(() => done());
    }
  }

  protected deleteCallLog(row: CallLogRow, ev: Event): void {
    ev.stopPropagation();
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    this.callLogsService
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        this.sel.removeId(row.id);
        this.refreshCallLogs();
      });
  }

  protected fieldInvalid(
    name:
      | 'direction'
      | 'phoneNumber'
      | 'contactName'
      | 'startedAt'
      | 'durationMin'
      | 'durationSec'
      | 'outcome'
      | 'summary',
  ): boolean {
    const c = this.callForm.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
}

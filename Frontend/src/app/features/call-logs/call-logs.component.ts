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
  contact: string;
  number: string;
  duration: string;
  when: string;
  outcome: string;
  /** ISO-local datetime for edit form (optional, mock persistence). */
  startedAtIso?: string;
  contactName?: string;
  callSummary?: string;
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

  private parseDuration(dur: string): { m: number; s: number } {
    const parts = dur.split(':');
    const m = Math.max(0, Math.min(99, Number(parts[0]) || 0));
    const s = Math.max(0, Math.min(59, Number(parts[1]) || 0));
    return { m, s };
  }

  private splitContactDisplay(contact: string): { name: string; summary: string } {
    const idx = contact.indexOf(' · ');
    if (idx < 0) return { name: contact.trim(), summary: '' };
    return {
      name: contact.slice(0, idx).trim(),
      summary: contact.slice(idx + 3).trim(),
    };
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
        const { m, s } = this.parseDuration(row.duration);
        const { name, summary } =
          row.contactName != null
            ? { name: row.contactName, summary: row.callSummary ?? '' }
            : this.splitContactDisplay(row.contact);
        const p = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        const fallback = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        this.callForm.patchValue({
          direction: row.direction === 'Inbound' ? 'inbound' : 'outbound',
          phoneNumber: row.number,
          contactName: name,
          startedAt: row.startedAtIso ?? fallback,
          durationMin: m,
          durationSec: s,
          outcome: this.outcomeCodeFromLabel(row.outcome),
          summary,
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
    const duration = `${this.pad2(mm)}:${this.pad2(ss)}`;
    const outcome = this.outcomeLabel(v.outcome);
    const summaryTrim = v.summary.trim();
    const contact =
      summaryTrim.length > 0
        ? `${v.contactName.trim()} · ${summaryTrim.slice(0, 48)}${summaryTrim.length > 48 ? '…' : ''}`
        : v.contactName.trim();

    const payload: Omit<CallLogRow, 'id'> = {
      direction,
      contact,
      number: v.phoneNumber.trim(),
      duration,
      when: this.formatWhen(v.startedAt),
      outcome,
      startedAtIso: v.startedAt,
      contactName: v.contactName.trim(),
      callSummary: summaryTrim,
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

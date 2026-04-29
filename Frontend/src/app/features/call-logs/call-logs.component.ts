import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface CallLogRow {
  id: string;
  direction: 'Inbound' | 'Outbound';
  contact: string;
  number: string;
  duration: string;
  when: string;
  outcome: string;
}

const SEED: CallLogRow[] = [
  {
    id: '1',
    direction: 'Outbound',
    contact: 'Alex Morgan',
    number: '+1 (415) 555-0192',
    duration: '12:04',
    when: 'Today, 10:02 AM',
    outcome: 'Connected',
  },
  {
    id: '2',
    direction: 'Inbound',
    contact: 'Acme Corp — main line',
    number: '+1 (212) 555-0147',
    duration: '03:41',
    when: 'Today, 9:18 AM',
    outcome: 'Connected',
  },
  {
    id: '3',
    direction: 'Outbound',
    contact: 'Maria Chen',
    number: '+1 (650) 555-0163',
    duration: '22:17',
    when: 'Yesterday, 3:55 PM',
    outcome: 'Voicemail',
  },
  {
    id: '4',
    direction: 'Inbound',
    contact: 'Unknown caller',
    number: '+1 (503) 555-0188',
    duration: '00:48',
    when: 'Yesterday, 11:06 AM',
    outcome: 'No answer',
  },
  {
    id: '5',
    direction: 'Outbound',
    contact: 'Northwind — procurement',
    number: '+44 20 7946 0958',
    duration: '07:29',
    when: 'Mon, Jan 27',
    outcome: 'Connected',
  },
];

@Component({
  selector: 'app-call-logs',
  imports: [ReactiveFormsModule],
  templateUrl: './call-logs.component.html',
  styleUrl: './call-logs.component.scss',
})
export class CallLogsComponent {
  private readonly fb = inject(FormBuilder);

  protected readonly formOpen = signal(false);
  protected readonly rows = signal<CallLogRow[]>(SEED);

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

  protected openForm(): void {
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
    const direction: 'Inbound' | 'Outbound' =
      v.direction === 'inbound' ? 'Inbound' : 'Outbound';
    const mm = Math.max(0, Math.min(99, Number(v.durationMin)));
    const ss = Math.max(0, Math.min(59, Number(v.durationSec)));
    const duration = `${this.pad2(mm)}:${this.pad2(ss)}`;
    const outcome = this.outcomeLabel(v.outcome);
    const contact =
      v.summary.trim().length > 0
        ? `${v.contactName.trim()} · ${v.summary.trim().slice(0, 48)}${v.summary.trim().length > 48 ? '…' : ''}`
        : v.contactName.trim();

    const newRow: CallLogRow = {
      id: `c-${Date.now()}`,
      direction,
      contact,
      number: v.phoneNumber.trim(),
      duration,
      when: this.formatWhen(v.startedAt),
      outcome,
    };
    this.rows.update((list) => [newRow, ...list]);
    this.closeForm();
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

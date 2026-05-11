import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { CallLogsService } from '../../core/services/call-logs.service';
import { DealsService } from '../../core/services/deals.service';
import { TasksService } from '../../core/services/tasks.service';
import { NotesService } from '../../core/services/notes.service';
import type { DealOwnerOption, DealPipelineStatus, DealRow } from './deals.component';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import type { CallLogRow } from '../call-logs/call-logs.component';
import type { NoteRelatedType, NoteRow } from '../notes/notes.component';
import type { TaskRow } from '../tasks/tasks.component';

type DetailTab = 'Activity' | 'Emails' | 'Comments' | 'Data' | 'Calls' | 'Tasks' | 'Notes' | 'Attachments';

interface DealAttachmentItem {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
}

interface DealCommentItem {
  id: string;
  authorName: string;
  authorInitial: string;
  body: string;
  whenLabel: string;
}

interface DealEmailThreadItem {
  id: string;
  senderDisplay: string;
  senderInitial: string;
  subjectLine: string;
  toAddress: string;
  status: 'Sent' | 'Draft';
  whenLabel: string;
  body: string;
}

@Component({
  selector: 'app-deal-detail',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './deal-detail.component.html',
  styleUrl: './deal-detail.component.scss',
})
export class DealDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly dealsService = inject(DealsService);
  private readonly callLogsService = inject(CallLogsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly createFlow = inject(CreateFlowService);
  protected readonly auth = inject(AuthService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly deal = signal<DealRow | null>(null);
  protected readonly activeTab = signal<DetailTab>('Data');
  protected readonly dataSaving = signal(false);
  protected readonly dealCallLogs = signal<CallLogRow[]>([]);
  protected readonly dealTasks = signal<TaskRow[]>([]);
  protected readonly dealNotes = signal<NoteRow[]>([]);
  protected readonly dealAttachments = signal<DealAttachmentItem[]>([]);
  protected readonly dealComments = signal<DealCommentItem[]>([]);
  protected readonly commentComposerOpen = signal(false);
  protected readonly commentDraft = signal('');

  protected readonly dealEmails = signal<DealEmailThreadItem[]>([]);
  protected readonly emailComposerOpen = signal(false);
  protected readonly emailComposeEmojiOpen = signal(false);

  protected readonly emailComposeEmojiChoices = ['😊', '👍', '✅', '🙏', '🎉', '❤️'] as const;

  protected readonly sidebarDetailsOpen = signal(true);
  protected readonly sidebarPersonOpen = signal(true);

  protected readonly emailTo = signal('');
  protected readonly emailCc = signal('');
  protected readonly emailBcc = signal('');
  protected readonly emailSubjectText = signal('');
  protected readonly emailBody = signal('');

  protected readonly tabs: DetailTab[] = [
    'Activity',
    'Emails',
    'Comments',
    'Data',
    'Calls',
    'Tasks',
    'Notes',
    'Attachments',
  ];

  protected readonly dealCode = computed(() => {
    const row = this.deal();
    const year = new Date().getFullYear();
    let seq = this.numericId() ?? NaN;
    if (!Number.isFinite(seq) && row?.id) {
      const parsed = Number.parseInt(row.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(parsed)) seq = parsed;
    }
    if (!Number.isFinite(seq)) seq = 0;
    return `CRM-DEAL-${year}-${String(seq).padStart(5, '0')}`;
  });

  protected readonly emailSubject = computed(() => {
    const customSubject = this.emailSubjectText();
    if (customSubject.trim()) {
      return customSubject;
    }
    const org = this.deal()?.organizationName?.trim() || 'Deal';
    return `${org} (${this.dealCode()})`;
  });

  protected readonly emailToLooksValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.emailTo().trim()));

  protected readonly dealStatuses: DealPipelineStatus[] = [
    'Qualification',
    'Proposal',
    'Negotiation',
    'Demo/Making',
    'Closed Won',
    'Closed Lost',
  ];

  protected readonly dealOwnerOptions: DealOwnerOption[] = [
    { id: 'SK', label: 'Sam Kumar', initials: 'SK' },
    { id: 'AM', label: 'Alex Morgan', initials: 'AM' },
    { id: 'JD', label: 'Jordan Doe', initials: 'JD' },
  ];

  private readonly noteRelatedTypeLabels: Record<NoteRelatedType, string> = {
    lead: 'Lead',
    deal: 'Deal',
    contact: 'Contact',
    organization: 'Organization',
  };

  protected readonly dataForm = this.fb.nonNullable.group({
    organization: ['', Validators.required],
    annualRevenue: [''],
    status: this.fb.nonNullable.control<DealPipelineStatus>('Qualification', Validators.required),
    email: ['', [Validators.email]],
    mobile: [''],
    dealOwner: ['SK', Validators.required],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(id)) {
        this.numericId.set(null);
        this.deal.set(null);
        this.dealCallLogs.set([]);
        this.dealTasks.set([]);
        this.dealNotes.set([]);
        this.dealAttachments.set([]);
        this.dealComments.set([]);
        this.commentComposerOpen.set(false);
        this.commentDraft.set('');
        this.dealEmails.set([]);
        this.emailComposerOpen.set(false);
        this.emailComposeEmojiOpen.set(false);
        return;
      }
      this.numericId.set(id);
      this.dealsService
        .getById(id)
        .pipe(take(1))
        .subscribe((row) => {
          this.deal.set(row);
          if (row) {
            this.patchDataForm(row);
            const em = row.email?.trim();
            this.emailTo.set(em && em !== '—' ? em : '');
            this.emailCc.set('');
            this.emailBcc.set('');
            const org = row.organizationName.trim() || 'Deal';
            this.emailSubjectText.set(`${org} (${this.dealCode()})`);
            this.emailBody.set('');
            this.refreshDealCallLogs();
            this.refreshDealTasks();
            this.refreshDealNotes();
            const did = row.id.trim();
            if (did) {
              this.loadDealAttachments(did);
              this.loadDealComments(did);
              this.loadDealEmails(did, row);
            } else {
              this.dealAttachments.set([]);
              this.dealComments.set([]);
              this.dealEmails.set([]);
            }
            this.commentComposerOpen.set(false);
            this.commentDraft.set('');
            this.emailComposerOpen.set(false);
            this.emailComposeEmojiOpen.set(false);
          } else {
            this.dealCallLogs.set([]);
            this.dealTasks.set([]);
            this.dealNotes.set([]);
            this.dealAttachments.set([]);
            this.dealComments.set([]);
            this.dealEmails.set([]);
            this.commentComposerOpen.set(false);
            this.commentDraft.set('');
            this.emailComposerOpen.set(false);
            this.emailComposeEmojiOpen.set(false);
          }
        });
    });

    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind === 'callLog') this.refreshDealCallLogs();
      if (e.kind === 'task') this.refreshDealTasks();
      if (e.kind === 'note') this.refreshDealNotes();
    });
  }

  private refreshDealCallLogs(): void {
    const d = this.deal();
    const did = d?.id;
    if (did == null || did === '') {
      this.dealCallLogs.set([]);
      return;
    }
    this.callLogsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const idNorm = did.trim();
        const scoped = rows.filter((r) => (r.relatedDealId ?? '').trim() === idNorm);
        this.dealCallLogs.set(scoped);
      });
  }

  private refreshDealTasks(): void {
    const d = this.deal();
    const did = d?.id;
    if (did == null || did === '') {
      this.dealTasks.set([]);
      return;
    }
    this.tasksService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const idNorm = did.trim();
        const scoped = rows.filter((r) => (r.relatedDealId ?? '').trim() === idNorm);
        this.dealTasks.set(scoped);
      });
  }

  private refreshDealNotes(): void {
    const d = this.deal();
    const did = d?.id;
    if (did == null || did === '') {
      this.dealNotes.set([]);
      return;
    }
    this.notesService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const idNorm = did.trim();
        const scoped = rows.filter((r) => (r.relatedDealId ?? '').trim() === idNorm);
        this.dealNotes.set(scoped);
      });
  }

  private attachmentStorageKey(dealId: string): string {
    return `crm.deal-detail.attach.v1:${dealId}`;
  }

  private isAttachmentRow(x: unknown): x is DealAttachmentItem {
    if (x == null || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o['id'] === 'string' &&
      typeof o['name'] === 'string' &&
      typeof o['sizeLabel'] === 'string' &&
      typeof o['uploadedAt'] === 'string'
    );
  }

  private loadDealAttachments(dealId: string): void {
    let rows: DealAttachmentItem[] = [];
    try {
      const raw = sessionStorage.getItem(this.attachmentStorageKey(dealId));
      if (!raw) {
        this.dealAttachments.set([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      rows = Array.isArray(parsed)
        ? (parsed.filter((item) => this.isAttachmentRow(item)) as DealAttachmentItem[]).slice(0, 200)
        : [];
    } catch {
      rows = [];
    }
    this.dealAttachments.set(rows);
  }

  private persistAttachments(dealId: string): void {
    try {
      sessionStorage.setItem(this.attachmentStorageKey(dealId), JSON.stringify(this.dealAttachments()));
    } catch {
      /* ignore quota / privacy mode */
    }
  }

  private formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    let n = bytes;
    let i = -1;
    const units = ['KB', 'MB', 'GB'] as const;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < units.length - 1);
    const rounded = n >= 100 || Number.isInteger(n) ? Math.round(n) : Math.round(n * 10) / 10;
    return `${rounded} ${units[i]}`;
  }

  protected onDealAttachmentFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const didRaw = this.deal()?.id;
    const did = didRaw?.trim();
    const files = input.files;
    if (!did || !files?.length) {
      input.value = '';
      return;
    }
    const next = [...this.dealAttachments()];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${i}-${file.name}`;
      next.unshift({
        id,
        name: file.name,
        sizeLabel: this.formatFileSize(file.size),
        uploadedAt: 'Just now',
      });
    }
    this.dealAttachments.set(next);
    this.persistAttachments(did);
    input.value = '';
  }

  private commentsStorageKey(dealId: string): string {
    return `crm.deal-detail.comments.v1:${dealId}`;
  }

  private isCommentRow(x: unknown): x is DealCommentItem {
    if (x == null || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o['id'] === 'string' &&
      typeof o['authorName'] === 'string' &&
      typeof o['authorInitial'] === 'string' &&
      typeof o['body'] === 'string' &&
      typeof o['whenLabel'] === 'string'
    );
  }

  private loadDealComments(dealId: string): void {
    const key = this.commentsStorageKey(dealId);
    const raw = sessionStorage.getItem(key);
    if (raw === null) {
      const seed: DealCommentItem[] = [
        {
          id: 'seed-crm-demo-comment-deal',
          authorName: 'CRM Demo',
          authorInitial: 'C',
          body: 'had word with CEO',
          whenLabel: '8 months ago',
        },
      ];
      this.dealComments.set(seed);
      try {
        sessionStorage.setItem(key, JSON.stringify(seed));
      } catch {
        /* ignore quota */
      }
      return;
    }
    let rows: DealCommentItem[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      rows = Array.isArray(parsed)
        ? (parsed.filter((item) => this.isCommentRow(item)) as DealCommentItem[]).slice(0, 200)
        : [];
    } catch {
      rows = [];
    }
    this.dealComments.set(rows);
  }

  private persistDealComments(dealId: string): void {
    try {
      sessionStorage.setItem(this.commentsStorageKey(dealId), JSON.stringify(this.dealComments()));
    } catch {
      /* ignore quota */
    }
  }

  protected openNewCommentFromDeal(): void {
    this.commentComposerOpen.set(true);
  }

  protected cancelDealCommentComposer(): void {
    this.commentComposerOpen.set(false);
    this.commentDraft.set('');
  }

  protected postDealComment(): void {
    const did = this.deal()?.id?.trim();
    if (!did) return;
    const text = this.commentDraft().trim();
    if (!text) return;
    const authName = this.auth.user()?.name?.trim() || 'User';
    const row: DealCommentItem = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `deal-comment-${Date.now()}`,
      authorName: authName,
      authorInitial: authName.trim() ? authName.trim().charAt(0).toUpperCase() : '?',
      body: text,
      whenLabel: 'Just now',
    };
    this.dealComments.update((list) => [row, ...list]);
    this.persistDealComments(did);
    this.commentDraft.set('');
    this.commentComposerOpen.set(false);
  }

  protected openReplyFromDealComments(): void {
    this.setTab('Emails');
  }

  private emailsStorageKey(dealId: string): string {
    return `crm.deal-detail.emails.v1:${dealId}`;
  }

  private isEmailThreadRow(x: unknown): x is DealEmailThreadItem {
    if (x == null || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    const status = o['status'];
    return (
      typeof o['id'] === 'string' &&
      typeof o['senderDisplay'] === 'string' &&
      typeof o['senderInitial'] === 'string' &&
      typeof o['subjectLine'] === 'string' &&
      typeof o['toAddress'] === 'string' &&
      (status === 'Sent' || status === 'Draft') &&
      typeof o['whenLabel'] === 'string' &&
      typeof o['body'] === 'string'
    );
  }

  private loadDealEmails(dealId: string, row: DealRow): void {
    const key = this.emailsStorageKey(dealId);
    const raw = sessionStorage.getItem(key);
    const displayName = row.organizationName.trim() || 'Deal';
    const code = this.dealCode();
    const makeSeed = (): DealEmailThreadItem[] => [
      {
        id: 'seed-crm-email-deal',
        senderDisplay: 'CRM Demo <crm-demo@assimilate.com>',
        senderInitial: 'C',
        subjectLine: `${displayName} (#${code})`,
        toAddress: 'abhijeet136@gmail.com',
        status: 'Sent',
        whenLabel: '8 months ago',
        body: 'Hello Sir, Test',
      },
    ];

    if (raw === null) {
      const seed = makeSeed();
      this.dealEmails.set(seed);
      try {
        sessionStorage.setItem(key, JSON.stringify(seed));
      } catch {
        /* ignore */
      }
      return;
    }
    let emails: DealEmailThreadItem[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      emails = Array.isArray(parsed)
        ? (parsed.filter((item) => this.isEmailThreadRow(item)) as DealEmailThreadItem[]).slice(0, 200)
        : [];
    } catch {
      emails = [];
    }
    this.dealEmails.set(emails);
  }

  private persistDealEmails(dealId: string): void {
    try {
      sessionStorage.setItem(this.emailsStorageKey(dealId), JSON.stringify(this.dealEmails()));
    } catch {
      /* ignore */
    }
  }

  protected openNewEmailFromDeal(): void {
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected cancelDealEmailComposer(): void {
    this.emailComposerOpen.set(false);
    this.emailComposeEmojiOpen.set(false);
  }

  protected toggleEmailComposeEmojiPicker(): void {
    this.emailComposeEmojiOpen.update((v) => !v);
  }

  protected insertEmailComposeEmoji(symbol: string): void {
    this.emailBody.update((b) => `${b}${symbol}`);
    this.emailComposeEmojiOpen.set(false);
  }

  protected onEmailComposeAttachmentsSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const list = input.files;
    input.value = '';
    if (!list?.length) return;
    const names = Array.from(list)
      .map((f) => f.name)
      .join(', ');
    const block = `\n\n---\nFiles attached: ${names}`;
    this.emailBody.update((b) => `${b}${block}`);
  }

  protected onEmailComposeImagesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const list = input.files;
    input.value = '';
    if (!list?.length) return;
    const names = Array.from(list)
      .map((f) => f.name)
      .join(', ');
    const block = `\n\n---\nImages attached: ${names}`;
    this.emailBody.update((b) => `${b}${block}`);
  }

  protected submitDealDraftEmail(): void {
    const did = this.deal()?.id?.trim();
    const d = this.deal();
    if (!did || !d) return;
    const to = this.emailTo().trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);
    if (!emailLooksValid) {
      return;
    }
    const subject = this.emailSubject().trim();
    const body = this.emailBody().trim();
    const authName = this.auth.user()?.name?.trim() || 'User';
    const safeLocal = authName
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')
      .replace(/^\.+|\.+$/g, '');
    const localPart = safeLocal.length > 0 ? safeLocal : 'user';
    const senderDisplay = `${authName} <${localPart}@crm.local>`;
    const orgName = d.organizationName.trim() || 'Deal';
    const item: DealEmailThreadItem = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `email-${Date.now()}`,
      senderDisplay,
      senderInitial: authName.trim() ? authName.trim().charAt(0).toUpperCase() : '?',
      subjectLine: subject || `${orgName} (#${this.dealCode()})`,
      toAddress: to,
      status: 'Sent',
      whenLabel: 'Just now',
      body: body.length > 0 ? body : '(No message body)',
    };
    this.dealEmails.update((list) => [item, ...list]);
    this.persistDealEmails(did);
    this.emailBody.set('');
    this.emailComposerOpen.set(false);
    this.emailComposeEmojiOpen.set(false);
  }

  protected openDealEmailComposer(): void {
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected openDealEmailReply(_thread?: DealEmailThreadItem): void {
    void _thread;
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected openDealEmailFooterComment(): void {
    this.setTab('Comments');
  }

  protected openLogCallFromDeal(): void {
    const d = this.deal();
    if (!d?.id) return;
    const mob = d.mobile?.trim();
    this.createFlow.selectEntity('callLog', {
      callLogFromLead: {
        relatedDealId: String(d.id),
        contactName: d.organizationName.trim() || 'Deal',
        ...(mob && mob !== '—' ? { phoneNumber: mob } : {}),
      },
    });
  }

  protected openNewTaskFromDeal(): void {
    const d = this.deal();
    if (!d?.id) return;
    this.createFlow.selectEntity('task', {
      taskFromLead: { relatedDealId: String(d.id) },
    });
  }

  protected openTaskForEdit(task: TaskRow): void {
    const id = task.id?.trim();
    if (!id) return;
    void this.router.navigate(['/tasks'], { queryParams: { edit: id } });
  }

  protected openCreateNoteFromDeal(): void {
    const d = this.deal();
    if (!d?.id) return;
    const displayName = d.organizationName.trim() || 'Deal';
    this.createFlow.selectEntity('note', {
      noteFromLead: {
        relatedDealId: String(d.id),
        dealRelatedName: displayName,
      },
    });
  }

  protected taskAssigneeChipInitial(task: TaskRow): string {
    const ini = task.assignedInitials?.trim();
    if (ini) return ini.charAt(0).toUpperCase();
    const assignee = task.assignedTo?.trim();
    if (assignee) return assignee.charAt(0).toUpperCase();
    return '?';
  }

  protected toggleSidebarDetails(): void {
    this.sidebarDetailsOpen.update((o) => !o);
  }

  protected toggleSidebarPerson(): void {
    this.sidebarPersonOpen.update((o) => !o);
  }

  private revenueNumberToInputString(value: number | undefined): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '';
    return value.toLocaleString('en-IN');
  }

  protected patchDataForm(row: DealRow): void {
    const ownerOpt = this.dealOwnerOptions.find(
      (o) => o.initials === row.assignedInitials || o.label === row.assignedTo,
    );
    const emailVal = row.email?.trim();
    const mobileVal = row.mobile?.trim();
    this.dataForm.patchValue(
      {
        organization: row.organizationName ?? '',
        annualRevenue: this.revenueNumberToInputString(row.annualRevenue),
        status: row.status,
        email: emailVal && emailVal !== '—' ? emailVal : '',
        mobile: mobileVal && mobileVal !== '—' ? mobileVal : '',
        dealOwner: ownerOpt?.id ?? 'SK',
      },
      { emitEvent: false },
    );
    this.dataForm.markAsPristine();
  }

  protected noteRelatedLabel(note: NoteRow): string {
    const label = this.noteRelatedTypeLabels[note.relatedType] ?? note.relatedType;
    const suffix = note.visibility === 'private' ? ' · Private' : '';
    return `${label} · ${note.relatedName}${suffix}`;
  }

  protected callMetaLine(call: CallLogRow): string {
    return `${call.phoneNumber} · ${this.formatCallDuration(call)} · ${call.outcome}`;
  }

  protected formatCallDuration(call: CallLogRow): string {
    const sec = Math.max(0, Math.floor(call.durationSeconds ?? 0));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  protected formatCallWhen(call: CallLogRow): string {
    const lm = call.lastModified?.trim();
    if (lm) return lm;
    return this.formatStartedAtLabel(call.startedAt);
  }

  private formatStartedAtLabel(iso: string): string {
    if (!iso?.trim()) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  protected setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  protected ownerInitial(): string {
    const owner = this.deal()?.assignedTo?.trim() || 'D';
    return owner.charAt(0).toUpperCase();
  }

  protected sidebarAddLabel(kind: string): string {
    return `Add ${kind}...`;
  }

  protected userHeaderChip(): string {
    const name = this.auth.user()?.name?.trim() || '';
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  protected discardDataEdits(): void {
    const row = this.deal();
    if (row) this.patchDataForm(row);
  }

  protected sidebarDealHeadline(row: DealRow): string {
    const org = this.dataForm.controls.organization.value?.trim();
    return org || row.organizationName.trim() || 'Deal';
  }

  protected sidebarDealAvatarLetter(row: DealRow): string {
    const org = this.dataForm.controls.organization.value?.trim() || row.organizationName.trim() || 'D';
    return org.charAt(0).toUpperCase();
  }

  protected sidebarOwnerChipInitial(): string {
    const id = this.dataForm.controls.dealOwner.value?.trim();
    const opt = this.dealOwnerOptions.find((o) => o.id === id);
    const label = opt?.label?.trim();
    if (label) return label.charAt(0).toUpperCase();
    const fb = this.deal()?.assignedTo?.trim();
    return fb ? fb.charAt(0).toUpperCase() : '?';
  }

  protected copyDealDetailUrl(): void {
    const url = typeof globalThis.location !== 'undefined' ? globalThis.location.href : '';
    if (!url) return;
    const run = async (): Promise<void> => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          return;
        }
      } catch {
        /* fallback */
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('aria-hidden', 'true');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    };
    void run();
  }

  protected saveDataTab(): void {
    const row = this.deal();
    const idn = this.numericId();
    if (!row || idn == null) return;

    if (this.dataForm.invalid) {
      this.dataForm.markAllAsTouched();
      return;
    }

    const v = this.dataForm.getRawValue();
    const opt = this.dealOwnerOptions.find((o) => o.id === v.dealOwner.trim());
    const emailTrim = v.email.trim();

    this.dataSaving.set(true);
    const payload: Partial<Omit<DealRow, 'id'>> = {
      organizationName: v.organization.trim(),
      annualRevenue: parseRevenueInputToNumber(v.annualRevenue),
      status: v.status,
      email: emailTrim || '—',
      mobile: v.mobile.trim() || '—',
      assignedTo: opt?.label ?? row.assignedTo,
      assignedInitials: opt?.initials ?? row.assignedInitials,
      lastModified: 'Just now',
    };

    this.dealsService
      .update(idn, payload)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.dataSaving.set(false);
          if (updated) {
            this.deal.set(updated);
            this.patchDataForm(updated);
            const org = updated.organizationName.trim() || 'Deal';
            this.emailSubjectText.set(`${org} (${this.dealCode()})`);
          }
        },
        error: () => this.dataSaving.set(false),
      });
  }

  protected openCreatePicker(): void {
    this.createFlow.openPicker();
  }

  protected confirmDeleteDeal(): void {
    const idn = this.numericId();
    if (idn == null) return;
    if (!confirm('Delete this deal?')) return;
    this.dealsService
      .delete(idn)
      .pipe(take(1))
      .subscribe(() => void this.router.navigateByUrl('/deals'));
  }
}

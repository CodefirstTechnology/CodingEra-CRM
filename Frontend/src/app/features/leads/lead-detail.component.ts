import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, defaultIfEmpty, last, take, tap } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { CallLogsService } from '../../core/services/call-logs.service';
import { DealsService } from '../../core/services/deals.service';
import { LeadsService } from '../../core/services/leads.service';
import { TasksService } from '../../core/services/tasks.service';
import { NotesService } from '../../core/services/notes.service';
import { mapLeadToDealRow } from '../../shared/utils/mappers';
import { environment } from '../../../environments/environment';
import type { LeadOwnerOption, LeadRow, LeadStatus } from './leads.component';
import type { CallLogRow } from '../call-logs/call-logs.component';
import type { NoteRelatedType, NoteRow } from '../notes/notes.component';
import type { TaskRow } from '../tasks/tasks.component';

type DetailTab = 'Activity' | 'Emails' | 'Comments' | 'Data' | 'Calls' | 'Tasks' | 'Notes' | 'Attachments';

interface LeadAttachmentItem {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
}

interface LeadCommentItem {
  id: string;
  authorName: string;
  authorInitial: string;
  body: string;
  whenLabel: string;
}

interface LeadEmailThreadItem {
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
  selector: 'app-lead-detail',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './lead-detail.component.html',
  styleUrl: './lead-detail.component.scss',
})
export class LeadDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly leadsService = inject(LeadsService);
  private readonly dealsService = inject(DealsService);
  private readonly callLogsService = inject(CallLogsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly createFlow = inject(CreateFlowService);
  protected readonly auth = inject(AuthService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly lead = signal<LeadRow | null>(null);
  protected readonly activeTab = signal<DetailTab>('Data');
  protected readonly dataSaving = signal(false);
  /** Call logs where `relatedLeadId` matches the open lead (from lead-detail “Log a Call”). */
  protected readonly leadCallLogs = signal<CallLogRow[]>([]);
  /** Tasks where `relatedLeadId` matches the open lead (from lead-detail “+ New Task”). */
  protected readonly leadTasks = signal<TaskRow[]>([]);
  /** Notes scoped to this lead (`relatedLeadId`) from lead-detail “Create note”. */
  protected readonly leadNotes = signal<NoteRow[]>([]);
  /** Client-side attachments for this lead (sessionStorage until backend exists). */
  protected readonly leadAttachments = signal<LeadAttachmentItem[]>([]);
  /** Client-side timeline comments for this lead (sessionStorage demo until backend exists). */
  protected readonly leadComments = signal<LeadCommentItem[]>([]);
  protected readonly commentComposerOpen = signal(false);
  protected readonly commentDraft = signal('');

  /** Client-side sent/draft emails for this lead timeline (sessionStorage until backend exists). */
  protected readonly leadEmails = signal<LeadEmailThreadItem[]>([]);
  protected readonly emailComposerOpen = signal(false);
  protected readonly emailComposeEmojiOpen = signal(false);

  /** Quick picks for the email compose emoji tool. */
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

  /** Matches reference style `CRM-LEAD-2026-00004` using current year + numeric row id when available. */
  protected readonly leadCode = computed(() => {
    const row = this.lead();
    const year = new Date().getFullYear();
    let seq = this.numericId() ?? NaN;
    if (!Number.isFinite(seq) && row?.id) {
      const parsed = Number.parseInt(row.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(parsed)) seq = parsed;
    }
    if (!Number.isFinite(seq)) seq = 0;
    return `CRM-LEAD-${year}-${String(seq).padStart(5, '0')}`;
  });

  protected readonly emailSubject = computed(() => {
    const customSubject = this.emailSubjectText();
    if (customSubject.trim()) {
      return customSubject;
    }

    const name = this.lead()?.name || 'Lead';
    return `Mr ${name} (${this.leadCode()})`;
  });

  protected readonly emailToLooksValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.emailTo().trim()));

  protected readonly territoryOptions = ['', 'India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;
  protected readonly industryOptions = [
    '',
    'Technology',
    'Finance',
    'Healthcare',
    'Manufacturing',
    'Retail',
    'Education',
    'Other',
  ] as const;
  protected readonly salutationOptions = ['', 'Mr', 'Mrs', 'Ms', 'Dr', 'Prof'] as const;
  protected readonly sourceOptions = ['', 'Website', 'Referral', 'Ads', 'Cold Call', 'Event', 'Other'] as const;
  protected readonly leadOwnerOptions: LeadOwnerOption[] = [
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
    organization: [''],
    website: [''],
    territory: [''],
    industry: [''],
    jobTitle: [''],
    source: [''],
    owner: [''],
    salutation: [''],
    firstName: ['', Validators.required],
    lastName: [''],
    email: [''],
    mobile: [''],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(id)) {
        this.numericId.set(null);
        this.lead.set(null);
        this.leadCallLogs.set([]);
        this.leadTasks.set([]);
        this.leadNotes.set([]);
        this.leadAttachments.set([]);
        this.leadComments.set([]);
        this.commentComposerOpen.set(false);
        this.commentDraft.set('');
        this.leadEmails.set([]);
        this.emailComposerOpen.set(false);
        this.emailComposeEmojiOpen.set(false);
        return;
      }
      this.numericId.set(id);
      this.leadsService
        .getById(id)
        .pipe(take(1))
        .subscribe((row) => {
          this.lead.set(row);
          if (row) {
            this.patchDataForm(row);
            this.emailTo.set(row.email ?? '');
            this.emailCc.set('');
            this.emailBcc.set('');
            this.emailSubjectText.set(`Mr ${row.name} (${this.leadCode()})`);
            this.emailBody.set('');
            this.refreshLeadCallLogs();
            this.refreshLeadTasks();
            this.refreshLeadNotes();
            const lid = row.id.trim();
            if (lid) {
              this.loadLeadAttachments(lid);
              this.loadLeadComments(lid);
              this.loadLeadEmails(lid, row);
            } else {
              this.leadAttachments.set([]);
              this.leadComments.set([]);
              this.leadEmails.set([]);
            }
            this.commentComposerOpen.set(false);
            this.commentDraft.set('');
            this.emailComposerOpen.set(false);
            this.emailComposeEmojiOpen.set(false);
          } else {
            this.leadCallLogs.set([]);
            this.leadTasks.set([]);
            this.leadNotes.set([]);
            this.leadAttachments.set([]);
            this.leadComments.set([]);
            this.leadEmails.set([]);
            this.commentComposerOpen.set(false);
            this.commentDraft.set('');
            this.emailComposerOpen.set(false);
            this.emailComposeEmojiOpen.set(false);
          }
        });
    });

    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind === 'callLog') this.refreshLeadCallLogs();
      if (e.kind === 'task') this.refreshLeadTasks();
      if (e.kind === 'note') this.refreshLeadNotes();
    });
  }

  private refreshLeadCallLogs(): void {
    const l = this.lead();
    const lid = l?.id;
    if (lid == null || lid === '') {
      this.leadCallLogs.set([]);
      return;
    }
    this.callLogsService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const idNorm = lid.trim();
        const forLead = rows.filter((r) => (r.relatedLeadId ?? '').trim() === idNorm);
        this.leadCallLogs.set(forLead);
      });
  }

  private refreshLeadTasks(): void {
    const l = this.lead();
    const lid = l?.id;
    if (lid == null || lid === '') {
      this.leadTasks.set([]);
      return;
    }
    this.tasksService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const idNorm = lid.trim();
        const forLead = rows.filter((r) => (r.relatedLeadId ?? '').trim() === idNorm);
        this.leadTasks.set(forLead);
      });
  }

  private refreshLeadNotes(): void {
    const l = this.lead();
    const lid = l?.id;
    if (lid == null || lid === '') {
      this.leadNotes.set([]);
      return;
    }
    this.notesService
      .getAll()
      .pipe(take(1))
      .subscribe((rows) => {
        const idNorm = lid.trim();
        const forLead = rows.filter((r) => (r.relatedLeadId ?? '').trim() === idNorm);
        this.leadNotes.set(forLead);
      });
  }

  private attachmentStorageKey(leadId: string): string {
    return `crm.lead-detail.attach.v1:${leadId}`;
  }

  private isAttachmentRow(x: unknown): x is LeadAttachmentItem {
    if (x == null || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o['id'] === 'string' &&
      typeof o['name'] === 'string' &&
      typeof o['sizeLabel'] === 'string' &&
      typeof o['uploadedAt'] === 'string'
    );
  }

  private loadLeadAttachments(leadId: string): void {
    let rows: LeadAttachmentItem[] = [];
    try {
      const raw = sessionStorage.getItem(this.attachmentStorageKey(leadId));
      if (!raw) {
        this.leadAttachments.set([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      rows = Array.isArray(parsed)
        ? (parsed.filter((item) => this.isAttachmentRow(item)) as LeadAttachmentItem[]).slice(0, 200)
        : [];
    } catch {
      rows = [];
    }
    this.leadAttachments.set(rows);
  }

  private persistAttachments(leadId: string): void {
    try {
      sessionStorage.setItem(this.attachmentStorageKey(leadId), JSON.stringify(this.leadAttachments()));
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

  /** Multi-file picker from header / empty-state “Upload Attachment”. */
  protected onLeadAttachmentFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const lidRaw = this.lead()?.id;
    const lid = lidRaw?.trim();
    const files = input.files;
    if (!lid || !files?.length) {
      input.value = '';
      return;
    }
    const next = [...this.leadAttachments()];
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
    this.leadAttachments.set(next);
    this.persistAttachments(lid);
    input.value = '';
  }

  private commentsStorageKey(leadId: string): string {
    return `crm.lead-detail.comments.v1:${leadId}`;
  }

  private isCommentRow(x: unknown): x is LeadCommentItem {
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

  private loadLeadComments(leadId: string): void {
    const key = this.commentsStorageKey(leadId);
    const raw = sessionStorage.getItem(key);
    if (raw === null) {
      const seed: LeadCommentItem[] = [
        {
          id: 'seed-crm-demo-comment',
          authorName: 'CRM Demo',
          authorInitial: 'C',
          body: 'had word with CEO',
          whenLabel: '8 months ago',
        },
      ];
      this.leadComments.set(seed);
      try {
        sessionStorage.setItem(key, JSON.stringify(seed));
      } catch {
        /* ignore quota */
      }
      return;
    }
    let rows: LeadCommentItem[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      rows = Array.isArray(parsed)
        ? (parsed.filter((item) => this.isCommentRow(item)) as LeadCommentItem[]).slice(0, 200)
        : [];
    } catch {
      rows = [];
    }
    this.leadComments.set(rows);
  }

  private persistLeadComments(leadId: string): void {
    try {
      sessionStorage.setItem(this.commentsStorageKey(leadId), JSON.stringify(this.leadComments()));
    } catch {
      /* ignore quota */
    }
  }

  protected openNewCommentFromLead(): void {
    this.commentComposerOpen.set(true);
  }

  protected cancelLeadCommentComposer(): void {
    this.commentComposerOpen.set(false);
    this.commentDraft.set('');
  }

  protected postLeadComment(): void {
    const lid = this.lead()?.id?.trim();
    if (!lid) return;
    const text = this.commentDraft().trim();
    if (!text) return;
    const authName = this.auth.user()?.name?.trim() || 'User';
    const row: LeadCommentItem = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `lead-comment-${Date.now()}`,
      authorName: authName,
      authorInitial: authName.trim() ? authName.trim().charAt(0).toUpperCase() : '?',
      body: text,
      whenLabel: 'Just now',
    };
    this.leadComments.update((list) => [row, ...list]);
    this.persistLeadComments(lid);
    this.commentDraft.set('');
    this.commentComposerOpen.set(false);
  }

  protected openReplyFromLeadComments(): void {
    this.setTab('Emails');
  }

  private emailsStorageKey(leadId: string): string {
    return `crm.lead-detail.emails.v1:${leadId}`;
  }

  private isEmailThreadRow(x: unknown): x is LeadEmailThreadItem {
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

  private loadLeadEmails(leadId: string, row: LeadRow): void {
    const key = this.emailsStorageKey(leadId);
    const raw = sessionStorage.getItem(key);
    const displayName = row.name.trim() || row.firstName?.trim() || 'Lead';
    const code = this.leadCode();
    const makeSeed = (): LeadEmailThreadItem[] => [
      {
        id: 'seed-crm-email',
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
      this.leadEmails.set(seed);
      try {
        sessionStorage.setItem(key, JSON.stringify(seed));
      } catch {
        /* ignore */
      }
      return;
    }
    let emails: LeadEmailThreadItem[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      emails = Array.isArray(parsed)
        ? (parsed.filter((item) => this.isEmailThreadRow(item)) as LeadEmailThreadItem[]).slice(0, 200)
        : [];
    } catch {
      emails = [];
    }
    this.leadEmails.set(emails);
  }

  private persistLeadEmails(leadId: string): void {
    try {
      sessionStorage.setItem(this.emailsStorageKey(leadId), JSON.stringify(this.leadEmails()));
    } catch {
      /* ignore */
    }
  }

  protected openNewEmailFromLead(): void {
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected cancelLeadEmailComposer(): void {
    this.emailComposerOpen.set(false);
    this.emailComposeEmojiOpen.set(false);
  }

  protected toggleEmailComposeEmojiPicker(): void {
    this.emailComposeEmojiOpen.update((v) => !v);
  }

  /** Inserts emoji at the end of the draft (picker closes). */
  protected insertEmailComposeEmoji(symbol: string): void {
    this.emailBody.update((b) => `${b}${symbol}`);
    this.emailComposeEmojiOpen.set(false);
  }

  /** Paperclip — append referenced file names to the body. */
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

  /** Picture — append referenced image file names to the body. */
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

  protected submitLeadDraftEmail(): void {
    const lid = this.lead()?.id?.trim();
    const l = this.lead();
    if (!lid || !l) return;
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
    const leadDisplayName = l.name.trim() || l.firstName?.trim() || 'Lead';
    const item: LeadEmailThreadItem = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `email-${Date.now()}`,
      senderDisplay,
      senderInitial: authName.trim() ? authName.trim().charAt(0).toUpperCase() : '?',
      subjectLine: subject || `${leadDisplayName} (#${this.leadCode()})`,
      toAddress: to,
      status: 'Sent',
      whenLabel: 'Just now',
      body: body.length > 0 ? body : '(No message body)',
    };
    this.leadEmails.update((list) => [item, ...list]);
    this.persistLeadEmails(lid);
    this.emailBody.set('');
    this.emailComposerOpen.set(false);
    this.emailComposeEmojiOpen.set(false);
  }

  protected openLeadEmailComposer(): void {
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  /** Card header reply / reply all — opens compose panel. */
  protected openLeadEmailReply(_thread?: LeadEmailThreadItem): void {
    void _thread;
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected openLeadEmailFooterComment(): void {
    this.setTab('Comments');
  }

  protected openLogCallFromLead(): void {
    const l = this.lead();
    if (!l?.id) return;
    const displayName =
      [l.firstName?.trim(), l.lastName?.trim()].filter(Boolean).join(' ') || l.name.trim() || 'Lead';
    this.createFlow.selectEntity('callLog', {
      callLogFromLead: {
        relatedLeadId: String(l.id),
        contactName: displayName,
        ...(l.mobile?.trim() ? { phoneNumber: l.mobile.trim() } : {}),
      },
    });
  }

  protected openNewTaskFromLead(): void {
    const l = this.lead();
    if (!l?.id) return;
    this.createFlow.selectEntity('task', {
      taskFromLead: { relatedLeadId: String(l.id) },
    });
  }

  protected openTaskForEdit(task: TaskRow): void {
    const id = task.id?.trim();
    if (!id) return;
    void this.router.navigate(['/tasks'], { queryParams: { edit: id } });
  }

  protected openCreateNoteFromLead(): void {
    const l = this.lead();
    if (!l?.id) return;
    const displayName =
      [l.firstName?.trim(), l.lastName?.trim()].filter(Boolean).join(' ') || l.name.trim() || 'Lead';
    this.createFlow.selectEntity('note', {
      noteFromLead: { relatedLeadId: String(l.id), leadRelatedName: displayName },
    });
  }

  /** First character for avatar chip (matches initials or assignee display name). */
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

  protected patchDataForm(row: LeadRow): void {
    const salutation = row.salutation?.replace(/\.$/, '') ?? '';
    this.dataForm.patchValue(
      {
        organization: row.organization ?? '',
        website: row.website ?? '',
        territory: row.territory ?? '',
        industry: row.industry ?? '',
        jobTitle: row.jobTitle ?? '',
        source: row.source ?? '',
        owner: row.owner ?? '',
        salutation,
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? '',
        email: row.email ?? '',
        mobile: row.mobile ?? '',
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
    const owner = this.lead()?.leadOwnerName?.trim() || this.lead()?.owner?.trim() || 'L';
    return owner.charAt(0).toUpperCase();
  }

  protected leadInitial(): string {
    const name = this.lead()?.firstName?.trim() || this.lead()?.name?.trim() || 'L';
    return name.charAt(0).toUpperCase();
  }

  protected sidebarAddLabel(kind: string): string {
    return `Add ${kind}...`;
  }

  /** Initial for header chip (leading letter shown before full name like "R Rohit Dhaygude"). */
  protected userHeaderChip(): string {
    const name = this.auth.user()?.name?.trim() || '';
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  protected discardDataEdits(): void {
    const row = this.lead();
    if (row) this.patchDataForm(row);
  }

  /** Sidebar name line — mirrors `saveDataTab` name computation. */
  protected sidebarLeadHeadline(row: LeadRow): string {
    const v = this.dataForm.getRawValue();
    const salutationNorm = v.salutation.trim() ? `${v.salutation.trim()}.` : '';
    return (
      [salutationNorm, v.firstName.trim(), v.lastName.trim()].filter(Boolean).join(' ').trim() ||
      v.firstName.trim() ||
      row.name
    );
  }

  protected sidebarLeadAvatarLetter(row: LeadRow): string {
    const fn = this.dataForm.controls.firstName.value?.trim();
    if (fn) return fn.charAt(0).toUpperCase();
    return this.leadInitial();
  }

  /** Lead owner initial beside the owner select (follows selected owner option). */
  protected sidebarOwnerChipInitial(): string {
    const id = this.dataForm.controls.owner.value?.trim();
    const opt = this.leadOwnerOptions.find((o) => o.id === id);
    const label = opt?.label?.trim();
    if (label) return label.charAt(0).toUpperCase();
    const fb = this.lead()?.leadOwnerName?.trim();
    return fb ? fb.charAt(0).toUpperCase() : '?';
  }

  protected copyLeadDetailUrl(): void {
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
    const row = this.lead();
    const idn = this.numericId();
    if (!row || idn == null) return;

    if (this.dataForm.invalid) {
      this.dataForm.markAllAsTouched();
      return;
    }

    const v = this.dataForm.getRawValue();
    const salutationNorm = v.salutation.trim() ? `${v.salutation.trim()}.` : '';
    const name = [salutationNorm, v.firstName.trim(), v.lastName.trim()].filter(Boolean).join(' ').trim() || v.firstName.trim() || row.name;

    const opt = this.leadOwnerOptions.find((o) => o.id === v.owner.trim());
    const leadOwnerName = opt?.label ?? row.leadOwnerName;

    this.dataSaving.set(true);
    const payload: Partial<Omit<LeadRow, 'id'>> = {
      name,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      salutation: salutationNorm || undefined,
      email: v.email.trim(),
      mobile: v.mobile.trim() || undefined,
      organization: v.organization.trim(),
      website: v.website.trim() || undefined,
      territory: v.territory.trim() || undefined,
      industry: v.industry.trim(),
      jobTitle: v.jobTitle.trim() || undefined,
      source: v.source.trim() || undefined,
      owner: v.owner.trim() || row.owner,
      leadOwnerName,
      updated: 'Just now',
    };

    this.leadsService
      .update(idn, payload)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.dataSaving.set(false);
          if (updated) {
            this.lead.set(updated);
            this.patchDataForm(updated);
            this.emailSubjectText.set(`Mr ${updated.name} (${this.leadCode()})`);
          }
        },
        error: () => this.dataSaving.set(false),
      });
  }

  protected convertToDeal(): void {
    const row = this.lead();
    const idn = this.numericId();
    if (!row || idn == null || row.status === 'Converted') return;

    const after = environment.leadConversionAfterDeal;
    this.dealsService
      .create(mapLeadToDealRow(row))
      .pipe(
        take(1),
        tap((created) => this.createRowBus.publish('deal', created)),
        concatMap(() =>
          after === 'delete'
            ? this.leadsService.delete(idn).pipe(take(1))
            : this.leadsService.update(idn, {
                status: 'Converted' satisfies LeadStatus,
                updated: 'Just now',
              }),
        ),
        last(),
        defaultIfEmpty(null),
      )
      .subscribe(() => {
        if (after === 'delete') {
          void this.router.navigateByUrl('/leads');
        } else {
          this.lead.update((cur) => (cur ? { ...cur, status: 'Converted', updated: 'Just now' } : cur));
        }
        if (environment.showLeadConvertSuccessMessage) {
          window.alert('Lead converted to deal successfully');
        }
      });
  }

  protected openCreatePicker(): void {
    this.createFlow.openPicker();
  }

  protected confirmDeleteLead(): void {
    const idn = this.numericId();
    if (idn == null) return;
    if (!confirm('Delete this lead?')) return;
    this.leadsService
      .delete(idn)
      .pipe(take(1))
      .subscribe(() => void this.router.navigateByUrl('/leads'));
  }
}

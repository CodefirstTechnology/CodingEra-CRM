import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { ActivitiesService } from '../../core/services/activities.service';
import type { ActivityGroup } from '../../core/services/activities/activity-api.models';
import { EmailsService, emailSendErrorMessage } from '../../core/services/emails.service';
import type { EntityEmailItem } from '../../core/services/emails/email-api.models';
import type { EntityCommentItem } from '../../core/services/comments/comment-api.models';
import { CommentsService } from '../../core/services/comments.service';
import type { ConvertLeadOptions } from '../../core/services/leads/lead-conversion.types';
import { LeadConversionStorageService } from '../../core/services/leads/lead-conversion-storage.service';
import {
  LeadMasterDataService,
  type MasterDataOption,
} from '../../core/services/leads/lead-master-data.service';
import { LeadsService, leadsHttpErrorMessage } from '../../core/services/leads.service';
import { ToastService } from '../../core/toast/toast.service';
import { TasksService } from '../../core/services/tasks.service';
import { NotesService } from '../../core/services/notes.service';
import { LeadOwnerOptionsService } from '../../core/services/leads/lead-owner-options.service';
import {
  buildLeadConversionActivityGroup,
  isLeadConverted,
} from '../../shared/utils/lead-conversion.util';
import { ConvertLeadModalComponent } from '../../shared/components/convert-lead-modal/convert-lead-modal.component';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { CrmPaginatedSelectComponent } from '../../shared/components/crm-paginated-select/crm-paginated-select.component';
import { masterDataToPaginatedOptions } from '../../shared/components/crm-paginated-select/crm-paginated-select.model';
import { EntityActivityTimelineComponent } from '../../shared/components/entity-activity-timeline/entity-activity-timeline.component';
import { parseEntityDetailTab } from '../../shared/utils/entity-record-nav.util';
import { leadRecordOwnerUserId } from '../../shared/utils/record-owner-user-id.util';
import type { LeadOwnerOption, LeadRow, LeadStatus } from './lead-row.model';
import type { NoteRelatedType, NoteRow } from '../notes/notes.component';
import type { TaskRow } from '../tasks/tasks.component';

const FALLBACK_TERRITORY_NAMES = ['India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;
const FALLBACK_SALUTATION_NAMES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'] as const;
const FALLBACK_INDUSTRY_NAMES = [
  'Technology',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Education',
  'Other',
] as const;

type DetailTab = 'Activity' | 'Emails' | 'Comments' | 'Data' | 'Tasks' | 'Notes' | 'Attachments';

interface LeadAttachmentItem {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
}

interface LeadCommentItem extends EntityCommentItem {}

@Component({
  selector: 'app-lead-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    EntityActivityTimelineComponent,
    CrmPaginatedSelectComponent,
    ConvertLeadModalComponent,
  ],
  templateUrl: './lead-detail.component.html',
  styleUrl: './lead-detail.component.scss',
})
export class LeadDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly leadsService = inject(LeadsService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly commentsService = inject(CommentsService);
  private readonly emailsService = inject(EmailsService);
  private readonly toast = inject(ToastService);
  private readonly conversionStorage = inject(LeadConversionStorageService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly leadMasterData = inject(LeadMasterDataService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly createFlow = inject(CreateFlowService);
  protected readonly auth = inject(AuthService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly lead = signal<LeadRow | null>(null);
  protected readonly activeTab = signal<DetailTab>('Data');
  protected readonly dataSaving = signal(false);
  protected readonly leadInitialLoading = signal(false);
  protected readonly leadLoadError = signal<string | null>(null);
  /** Tasks where `relatedLeadId` matches the open lead (from lead-detail “+ New Task”). */
  protected readonly leadTasks = signal<TaskRow[]>([]);
  /** Notes scoped to this lead (`relatedLeadId`) from lead-detail “Create note”. */
  protected readonly leadNotes = signal<NoteRow[]>([]);
  /** Client-side attachments for this lead (sessionStorage until backend exists). */
  protected readonly leadAttachments = signal<LeadAttachmentItem[]>([]);
  /** Comments for this lead from the comments API. */
  protected readonly leadComments = signal<LeadCommentItem[]>([]);
  protected readonly leadActivityGroups = signal<ActivityGroup[]>([]);
  protected readonly leadActivityLoading = signal(false);
  protected readonly convertModalOpen = signal(false);
  protected readonly isLeadConverted = isLeadConverted;
  protected readonly convertedDealId = computed(() => {
    const row = this.lead();
    if (!row) return null;
    return row.convertedDealId ?? this.conversionStorage.getLeadLink(row.id)?.convertedDealId ?? null;
  });
  protected readonly commentComposerOpen = signal(false);
  protected readonly commentDraft = signal('');
  protected readonly commentPosting = signal(false);

  /** Sent emails for this lead from the emails API. */
  protected readonly leadEmails = signal<EntityEmailItem[]>([]);
  protected readonly leadEmailsLoading = signal(false);
  protected readonly emailSending = signal(false);
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
  protected readonly emailComposeValid = computed(
    () =>
      this.emailToLooksValid() &&
      this.emailSubject().trim().length > 0 &&
      this.emailBody().trim().length > 0,
  );

  protected readonly sourceOptions = ['', 'Website', 'Referral', 'Ads', 'Cold Call', 'Event', 'Other'] as const;

  private readonly salutationsFromApi = signal<MasterDataOption[]>([]);
  private readonly territoriesFromApi = signal<MasterDataOption[]>([]);
  private readonly industriesFromApi = signal<MasterDataOption[]>([]);

  protected readonly territorySelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.territoriesFromApi();
    return api.length > 0 ? api : FALLBACK_TERRITORY_NAMES.map((name) => ({ id: 0, name }));
  });
  protected readonly salutationSelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.salutationsFromApi();
    return api.length > 0 ? api : FALLBACK_SALUTATION_NAMES.map((name) => ({ id: 0, name }));
  });
  protected readonly industrySelectOptions = computed<MasterDataOption[]>(() => {
    const api = this.industriesFromApi();
    return api.length > 0 ? api : FALLBACK_INDUSTRY_NAMES.map((name) => ({ id: 0, name }));
  });

  /** Source dropdown includes the lead's current source when it is not in the static list (e.g. Justdial Enquiry). */
  protected readonly sourceOptionsForLead = computed(() => {
    const base = [...this.sourceOptions];
    const current = this.lead()?.source?.trim();
    if (current && !base.includes(current as (typeof base)[number])) {
      return [...base, current];
    }
    return base;
  });

  protected readonly territoryPaginatedOptions = computed(() =>
    masterDataToPaginatedOptions(this.territorySelectOptions(), {
      value: '',
      label: '— Select —',
    }),
  );
  protected readonly industryPaginatedOptions = computed(() =>
    masterDataToPaginatedOptions(this.industrySelectOptions(), {
      value: '',
      label: '— Select —',
    }),
  );
  protected readonly salutationPaginatedOptions = computed(() =>
    masterDataToPaginatedOptions(this.salutationSelectOptions(), { value: '', label: '—' }),
  );
  protected readonly sourcePaginatedOptions = computed(() =>
    this.sourceOptionsForLead().map((s) => ({
      value: s,
      label: s === '' ? '— Select —' : s,
    })),
  );
  protected readonly leadOwnerPaginatedOptions = computed(() =>
    this.leadOwnerOptions().map((o) => ({ value: o.id, label: o.label })),
  );
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);
  private readonly userScope = inject(UserDataScopeService);
  protected readonly leadOwnerOptions = this.leadOwnerOpts.options;
  /** Only admins may change lead owner; users see read-only owner text. */
  protected readonly isAdminViewer = computed(() => this.userScope.isAdminSession());

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
    source: [''],
    owner: [''],
    salutation: [''],
    firstName: ['', Validators.required],
    lastName: [''],
    email: [''],
    mobile: [''],
  });

  constructor() {
    this.leadOwnerOpts.load();
    forkJoin({
      salutations: this.leadMasterData.loadSalutations(),
      territories: this.leadMasterData.loadTerritories(),
      industries: this.leadMasterData.loadIndustries(),
    })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (r) => {
          this.salutationsFromApi.set(r.salutations);
          this.territoriesFromApi.set(r.territories);
          this.industriesFromApi.set(r.industries);
        },
      });

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(id)) {
        this.numericId.set(null);
        this.lead.set(null);
        this.leadLoadError.set(null);
        this.leadInitialLoading.set(false);
        this.leadTasks.set([]);
        this.leadNotes.set([]);
        this.leadAttachments.set([]);
        this.leadComments.set([]);
        this.leadActivityGroups.set([]);
        this.commentComposerOpen.set(false);
        this.commentDraft.set('');
        this.leadEmails.set([]);
        this.emailComposerOpen.set(false);
        this.emailComposeEmojiOpen.set(false);
        return;
      }
      this.numericId.set(id);
      void this.hydrateLeadFromRoute(id);
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((query) => {
      const tab = parseEntityDetailTab(query.get('tab'));
      if (tab) this.setTab(tab);
    });

    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind === 'task') {
        this.refreshLeadTasks();
        this.refreshLeadActivities();
      }
      if (e.kind === 'note') {
        this.refreshLeadNotes();
        this.refreshLeadActivities();
      }
    });
  }

  private clearLeadSideState(): void {
    this.leadTasks.set([]);
    this.leadNotes.set([]);
    this.leadAttachments.set([]);
    this.leadComments.set([]);
    this.leadActivityGroups.set([]);
    this.leadEmails.set([]);
    this.commentComposerOpen.set(false);
    this.commentDraft.set('');
    this.emailComposerOpen.set(false);
    this.emailComposeEmojiOpen.set(false);
  }

  private applyLoadedLead(row: LeadRow): void {
    this.patchDataForm(row);
    this.emailTo.set(row.email ?? '');
    this.emailCc.set('');
    this.emailBcc.set('');
    this.emailSubjectText.set(`Mr ${row.name} (${this.leadCode()})`);
    this.emailBody.set('');
    this.refreshLeadTasks();
    this.refreshLeadNotes();
    this.refreshLeadActivities();
    const lid = row.id.trim();
    if (lid) {
      this.loadLeadAttachments(lid);
      this.refreshLeadComments();
      this.refreshLeadEmails();
    } else {
      this.leadAttachments.set([]);
      this.leadComments.set([]);
      this.leadEmails.set([]);
    }
    this.commentComposerOpen.set(false);
    this.commentDraft.set('');
    this.emailComposerOpen.set(false);
    this.emailComposeEmojiOpen.set(false);
  }

  private async hydrateLeadFromRoute(id: number): Promise<void> {
    this.leadInitialLoading.set(true);
    this.leadLoadError.set(null);
    try {
      const row = await this.leadsService.getByIdAsync(id);
      const enriched = row ? this.leadOwnerOpts.applyOwnerToRow(row) : null;
      this.lead.set(enriched);
      if (enriched) {
        this.applyLoadedLead(enriched);
      } else {
        this.leadLoadError.set('Lead not found.');
        this.clearLeadSideState();
      }
    } catch (e) {
      this.leadLoadError.set(leadsHttpErrorMessage(e));
      this.lead.set(null);
      this.clearLeadSideState();
    } finally {
      this.leadInitialLoading.set(false);
    }
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
    const n = files.length;
    this.toast.success(n === 1 ? 'Attachment added.' : `${n} attachments added.`);
  }

  private refreshLeadActivities(): void {
    const id = this.numericId();
    if (id == null) {
      this.leadActivityGroups.set([]);
      return;
    }
    this.leadActivityLoading.set(true);
    this.activitiesService
      .getLeadGroups(id)
      .pipe(take(1))
      .subscribe({
        next: (groups) => {
          const conversionGroup = this.buildConversionActivityGroup();
          this.leadActivityGroups.set(
            conversionGroup ? [conversionGroup, ...groups] : groups,
          );
          this.leadActivityLoading.set(false);
        },
        error: () => {
          this.leadActivityGroups.set([]);
          this.leadActivityLoading.set(false);
        },
      });
  }

  private refreshLeadComments(): void {
    const id = this.numericId();
    if (id == null) {
      this.leadComments.set([]);
      return;
    }
    this.commentsService
      .listForEntity('lead', id)
      .pipe(take(1))
      .subscribe({
        next: (rows) => this.leadComments.set(rows),
        error: () => this.leadComments.set([]),
      });
  }

  private refreshLeadEmails(): void {
    const id = this.numericId();
    if (id == null) {
      this.leadEmails.set([]);
      return;
    }
    this.leadEmailsLoading.set(true);
    this.emailsService
      .listForEntity('lead', id)
      .pipe(take(1))
      .subscribe({
        next: (rows) => {
          this.leadEmails.set(rows);
          this.leadEmailsLoading.set(false);
        },
        error: () => {
          this.leadEmails.set([]);
          this.leadEmailsLoading.set(false);
        },
      });
  }

  protected openNewCommentFromLead(): void {
    this.commentComposerOpen.set(true);
  }

  protected cancelLeadCommentComposer(): void {
    this.commentComposerOpen.set(false);
    this.commentDraft.set('');
  }

  protected postLeadComment(): void {
    const id = this.numericId();
    const text = this.commentDraft().trim();
    if (id == null || !text || this.commentPosting()) return;

    this.commentPosting.set(true);
    this.commentsService
      .createForEntity('lead', id, text)
      .pipe(take(1))
      .subscribe({
        next: (row) => {
          this.leadComments.update((list) => [row, ...list]);
          this.commentDraft.set('');
          this.commentComposerOpen.set(false);
          this.commentPosting.set(false);
          this.refreshLeadActivities();
          this.toast.success('Comment posted.');
        },
        error: () => {
          this.commentPosting.set(false);
          this.toast.error('Could not post comment. Try again.');
        },
      });
  }

  protected openReplyFromLeadComments(): void {
    this.setTab('Emails');
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
    const id = this.numericId();
    if (id == null || this.emailSending()) return;

    const to = this.emailTo().trim();
    const subject = this.emailSubject().trim();
    const body = this.emailBody().trim();
    if (!this.emailComposeValid()) return;

    this.emailSending.set(true);
    this.emailsService
      .sendForEntity({
        entityType: 'lead',
        entityId: id,
        toEmail: to,
        subject,
        body,
        isHtml: true,
      })
      .pipe(take(1))
      .subscribe({
        next: (row) => {
          this.leadEmails.update((list) => [row, ...list]);
          this.emailBody.set('');
          this.emailComposerOpen.set(false);
          this.emailComposeEmojiOpen.set(false);
          this.emailSending.set(false);
          this.refreshLeadActivities();
          if (row.status === 'Failed') {
            this.toast.error(row.failureMessage || 'Email could not be sent.');
          } else {
            this.toast.success('Email sent.');
          }
        },
        error: (err) => {
          this.emailSending.set(false);
          this.toast.error(emailSendErrorMessage(err));
        },
      });
  }

  protected openLeadEmailComposer(): void {
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  /** Card header reply / reply all — opens compose panel. */
  protected openLeadEmailReply(thread?: EntityEmailItem): void {
    if (thread?.subjectLine) {
      const subj = thread.subjectLine.trim();
      this.emailSubjectText.set(/^re:/i.test(subj) ? subj : `Re: ${subj}`);
    }
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected openLeadEmailFooterComment(): void {
    this.setTab('Comments');
  }

  protected openNewTaskFromLead(): void {
    const l = this.lead();
    if (!l?.id) return;
    this.createFlow.selectEntity('task', {
      taskFromLead: {
        relatedLeadId: String(l.id),
        recordOwnerUserId: leadRecordOwnerUserId(l),
      },
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
      noteFromLead: {
        relatedLeadId: String(l.id),
        leadRelatedName: displayName,
        recordOwnerUserId: leadRecordOwnerUserId(l),
      },
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

  /** Select `[value]` for master-backed dropdowns (`id` > 0 → numeric string, else label). */
  protected masterOptionFormValue(opt: MasterDataOption): string {
    return opt.id > 0 ? String(opt.id) : opt.name;
  }

  private masterSelectControlValue(
    id: number | null | undefined,
    label: string | null | undefined,
    options: MasterDataOption[],
  ): string {
    if (id != null && id > 0) return String(id);
    const name = label?.trim();
    if (!name) return '';
    const norm = (s: string) => s.trim().replace(/\.$/, '').toLowerCase();
    const key = norm(name);
    const byName = options.find((o) => o.id > 0 && norm(o.name) === key);
    if (byName) return String(byName.id);
    const legacy = options.find((o) => o.id === 0 && norm(o.name) === key);
    return legacy ? legacy.name : name;
  }

  private salutationLabelFromFormValue(value: string): string {
    const v = value.trim();
    if (!v) return '';
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      return this.salutationSelectOptions().find((o) => o.id === n)?.name ?? '';
    }
    return v;
  }

  private resolveMasterPick(
    rawValue: string,
    options: MasterDataOption[],
  ): { label: string; masterId?: number } {
    const v = rawValue.trim();
    if (!v) return { label: '' };
    const asNum = Number(v);
    if (Number.isFinite(asNum) && asNum > 0) {
      const opt = options.find((o) => o.id === asNum);
      return { label: opt?.name ?? '', masterId: asNum };
    }
    return { label: v };
  }

  protected toggleSidebarDetails(): void {
    this.sidebarDetailsOpen.update((o) => !o);
  }

  protected toggleSidebarPerson(): void {
    this.sidebarPersonOpen.update((o) => !o);
  }

  protected patchDataForm(row: LeadRow): void {
    const salutationPlain = row.salutation?.replace(/\.$/, '') ?? '';
    this.dataForm.patchValue(
      {
        organization: row.organization ?? '',
        website: row.website ?? '',
        territory: this.masterSelectControlValue(row.territoryId, row.territory, this.territorySelectOptions()),
        industry: this.masterSelectControlValue(row.industryId, row.industry, this.industrySelectOptions()),
        source: row.source?.trim() || row.leadSource || '',
        owner: row.leadOwnerId ?? '',
        salutation: this.masterSelectControlValue(row.salutationId, salutationPlain, this.salutationSelectOptions()),
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

  protected setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    if (tab === 'Activity') this.refreshLeadActivities();
    if (tab === 'Comments') this.refreshLeadComments();
    if (tab === 'Emails') this.refreshLeadEmails();
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
    const salLabel = this.salutationLabelFromFormValue(v.salutation);
    const salutationNorm = salLabel.trim() ? `${salLabel.trim().replace(/\.$/, '')}.` : '';
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

  protected displayLeadOwnerName(): string {
    const row = this.lead();
    return row?.leadOwnerName?.trim() || row?.owner?.trim() || '—';
  }

  /** Lead owner initial beside the owner select (follows selected owner option). */
  protected sidebarOwnerChipInitial(): string {
    const id = this.dataForm.controls.owner.value?.trim();
    const opt = this.leadOwnerOpts.findById(id);
    const label = opt?.label?.trim();
    if (label) return label.charAt(0).toUpperCase();
    const fb = this.lead()?.leadOwnerName?.trim();
    return fb ? fb.charAt(0).toUpperCase() : '?';
  }

  protected async saveDataTab(): Promise<void> {
    const row = this.lead();
    const idn = this.numericId();
    if (!row || idn == null) return;

    if (this.dataForm.invalid) {
      this.dataForm.markAllAsTouched();
      return;
    }

    const v = this.dataForm.getRawValue();
    const salPick = this.resolveMasterPick(v.salutation, this.salutationSelectOptions());
    const terrPick = this.resolveMasterPick(v.territory, this.territorySelectOptions());
    const indPick = this.resolveMasterPick(v.industry, this.industrySelectOptions());
    const salBase = salPick.label.trim().replace(/\.$/, '');
    const salutationNorm = salBase ? `${salBase}.` : '';
    const name =
      [salutationNorm, v.firstName.trim(), v.lastName.trim()].filter(Boolean).join(' ').trim() ||
      v.firstName.trim() ||
      row.name;

    const ownerId = this.isAdminViewer() ? v.owner.trim() : (row.leadOwnerId ?? '').trim();
    const opt = this.isAdminViewer() ? this.leadOwnerOpts.findById(ownerId) : null;
    const leadOwnerName = opt?.label ?? row.leadOwnerName;

    this.dataSaving.set(true);
    const payload: Partial<Omit<LeadRow, 'id'>> = {
      name,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      salutation: salutationNorm || undefined,
      salutationId: salPick.masterId,
      email: v.email.trim(),
      mobile: v.mobile.trim() || undefined,
      organization: v.organization.trim(),
      ...(row.organizationId?.trim() ? { organizationId: row.organizationId.trim() } : {}),
      website: v.website.trim() || undefined,
      territory: terrPick.label.trim() || undefined,
      territoryId: terrPick.masterId,
      industry: indPick.label.trim() || undefined,
      industryId: indPick.masterId,
      source: v.source.trim() || undefined,
      leadOwnerId: ownerId || undefined,
      owner: opt?.initials ?? row.owner,
      leadOwnerName,
      updated: 'Just now',
    };

    try {
      const updated = await this.leadsService.updateAsync(idn, payload);
      if (updated) {
        const enriched = this.leadOwnerOpts.applyOwnerToRow(updated);
        this.lead.set(enriched);
        this.patchDataForm(enriched);
        this.emailSubjectText.set(`Mr ${updated.name} (${this.leadCode()})`);
        const ownerDirty = this.isAdminViewer() && this.dataForm.controls.owner.dirty;
        const otherDirty =
          this.dataForm.controls.firstName.dirty ||
          this.dataForm.controls.lastName.dirty ||
          this.dataForm.controls.email.dirty ||
          this.dataForm.controls.mobile.dirty ||
          this.dataForm.controls.organization.dirty ||
          this.dataForm.controls.website.dirty ||
          this.dataForm.controls.territory.dirty ||
          this.dataForm.controls.industry.dirty ||
          this.dataForm.controls.source.dirty ||
          this.dataForm.controls.salutation.dirty;
        if (ownerDirty && !otherDirty) {
          const name = enriched.leadOwnerName?.trim() || '—';
          this.toast.success(
            name === '—' ? 'Lead owner cleared.' : `Lead owner changed to ${name}.`,
          );
        } else {
          this.toast.success('Lead saved.');
        }
      }
    } catch (e) {
      this.toast.error(leadsHttpErrorMessage(e));
    } finally {
      this.dataSaving.set(false);
    }
  }

  protected openConvertModal(): void {
    const row = this.lead();
    if (!row || isLeadConverted(row)) return;
    this.convertModalOpen.set(true);
  }

  protected closeConvertModal(): void {
    this.convertModalOpen.set(false);
  }

  protected onConvertModalConfirm(options: ConvertLeadOptions): void {
    const idn = this.numericId();
    if (idn == null) return;
    this.convertModalOpen.set(false);
    this.leadsService.convertToDeal(idn, options).pipe(take(1)).subscribe({
      next: (result) => {
        this.createRowBus.publish('deal', result.deal);
        if (result.lead == null) {
          this.toast.success('Lead converted to deal successfully');
          void this.router.navigate(['/deals', result.deal.id]);
          return;
        }
        this.lead.set(result.lead);
        this.refreshLeadActivities();
        this.toast.success('Lead converted to deal successfully');
      },
      error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
    });
  }

  private buildConversionActivityGroup(): ActivityGroup | null {
    const idn = this.numericId();
    const row = this.lead();
    if (idn == null || !row) return null;
    const link = this.conversionStorage.getLeadLink(row.id);
    if (!link) return null;
    return buildLeadConversionActivityGroup(idn, link.convertedDealId, link.convertedAt);
  }

  protected openCreatePicker(): void {
    this.createFlow.openPicker();
  }

  protected async confirmDeleteLead(): Promise<void> {
    const idn = this.numericId();
    if (idn == null) return;
    if (!confirm('Delete this lead?')) return;
    try {
      await this.leadsService.deleteAsync(idn);
      this.toast.success('Lead deleted.');
      void this.router.navigateByUrl('/leads');
    } catch (e) {
      this.toast.error(leadsHttpErrorMessage(e));
    }
  }
}

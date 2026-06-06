import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, take } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { ActivitiesService } from '../../core/services/activities.service';
import type { ActivityGroup } from '../../core/services/activities/activity-api.models';
import { CommentsService } from '../../core/services/comments.service';
import type { EntityCommentItem } from '../../core/services/comments/comment-api.models';
import { DealsService } from '../../core/services/deals.service';
import { LeadOwnerOptionsService } from '../../core/services/leads/lead-owner-options.service';
import { DealMasterSelectService } from '../../core/services/deals/deal-master-select.service';
import {
  masterOptionFormValue,
  masterSelectControlValue,
  resolveOrgMasterPick,
} from '../../core/services/organizations/organization-master-select.util';
import { resolveDealStatusLabel, dealStatusCssKind } from '../../core/services/deals/deal-status.constants';
import {
  buildDealDetailProgressStages,
  dealStatusMatchesProgressStage,
  DEFAULT_DEAL_PIPELINE_STATUS,
  dealDetailProgressIndex,
  dealProgressStageVisualState,
  isDealClosed,
  isDealClosedLost,
  resolveDealStatusSelectValue,
  type DealDetailProgressStage,
  type DealProgressStageVisualState,
} from '../../core/services/deals/deal-pipeline.constants';
import {
  isClosedLostStatus,
  isClosedStatus,
  toDealPipelineRows,
} from '../../core/services/deals/deal-pipeline-config.util';
import type { DealStageHistoryRecord } from '../../core/services/deals/deal-http.service';
import {
  canSelectDealStage,
  DEAL_STAGE_CLOSED_MESSAGE,
  validateDealStageTransition,
} from '../../core/services/deals/deal-stage-validation.util';
import { UserDataScopeService } from '../../core/services/user-data-scope.service';
import { PermissionService } from '../../core/services/permission.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { TasksService } from '../../core/services/tasks.service';
import { NotesService } from '../../core/services/notes.service';
import { EmailsService, emailSendErrorMessage } from '../../core/services/emails.service';
import type { EntityEmailItem } from '../../core/services/emails/email-api.models';
import { ToastService } from '../../core/toast/toast.service';
import { QuotationsService } from '../../core/services/quotations.service';
import { EntityActivityTimelineComponent } from '../../shared/components/entity-activity-timeline/entity-activity-timeline.component';
import { parseEntityDetailTab } from '../../shared/utils/entity-record-nav.util';
import { dealRecordOwnerUserId } from '../../shared/utils/record-owner-user-id.util';
import type { DealOwnerOption, DealPipelineStatus, DealRow } from './deals.component';
import {
  GSTIN_ERROR_KEY,
  GSTIN_ERROR_MESSAGE,
  gstControlInvalid,
  normalizeGstin,
  syncGstinInputFromEvent,
} from '../../shared/utils/gstin.util';
import { gstFormValidators } from '../../shared/validators/crm-validators';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
import {
  buildDealQuotationPrefill,
  storeDealQuotationPrefill,
} from '../../shared/utils/deal-quotation-prefill.util';
import type { NoteRelatedType, NoteRow } from '../notes/notes.component';
import type { TaskRow } from '../tasks/tasks.component';

type DetailTab = 'Activity' | 'Emails' | 'Comments' | 'Data' | 'Tasks' | 'Notes' | 'Attachments';

interface DealAttachmentItem {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
}

interface DealCommentItem extends EntityCommentItem {}

@Component({
  selector: 'app-deal-detail',
  imports: [RouterLink, ReactiveFormsModule, EntityActivityTimelineComponent],
  templateUrl: './deal-detail.component.html',
  styleUrl: './deal-detail.component.scss',
})
export class DealDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly dealsService = inject(DealsService);
  private readonly ownerOpts = inject(LeadOwnerOptionsService);
  protected readonly dealMaster = inject(DealMasterSelectService);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly commentsService = inject(CommentsService);
  private readonly emailsService = inject(EmailsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly toast = inject(ToastService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly createFlow = inject(CreateFlowService);
  protected readonly auth = inject(AuthService);
  private readonly quotationsService = inject(QuotationsService);
  private readonly userScope = inject(UserDataScopeService);
  private readonly permissions = inject(PermissionService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly deal = signal<DealRow | null>(null);
  protected readonly dealQuotationId = signal<number | null>(null);
  protected readonly activeTab = signal<DetailTab>('Activity');
  protected readonly dataSaving = signal(false);
  protected readonly dealTasks = signal<TaskRow[]>([]);
  protected readonly dealNotes = signal<NoteRow[]>([]);
  protected readonly dealAttachments = signal<DealAttachmentItem[]>([]);
  protected readonly dealComments = signal<DealCommentItem[]>([]);
  protected readonly dealActivityGroups = signal<ActivityGroup[]>([]);
  protected readonly dealActivityLoading = signal(false);
  protected readonly commentComposerOpen = signal(false);
  protected readonly commentDraft = signal('');
  protected readonly commentPosting = signal(false);

  protected readonly dealEmails = signal<EntityEmailItem[]>([]);
  protected readonly dealEmailsLoading = signal(false);
  protected readonly emailSending = signal(false);
  protected readonly emailComposerOpen = signal(false);
  protected readonly emailComposeEmojiOpen = signal(false);

  protected readonly emailComposeEmojiChoices = ['😊', '👍', '✅', '🙏', '🎉', '❤️'] as const;

  protected readonly stageHistory = signal<DealStageHistoryRecord[]>([]);
  protected readonly progressUpdating = signal(false);
  protected readonly lostReasonModalOpen = signal(false);
  protected readonly lostReasonDraft = signal('');
  protected readonly pendingLostStage = signal<{
    status: string;
    name: string;
    dealStatusId: number;
  } | null>(null);
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
  protected readonly emailComposeValid = computed(
    () =>
      this.emailToLooksValid() &&
      this.emailSubject().trim().length > 0 &&
      this.emailBody().trim().length > 0,
  );

  protected readonly dealStatuses = this.dealMaster.statusSelectOptions;
  protected readonly masterOptionFormValue = masterOptionFormValue;
  protected readonly progressStages = computed(() => buildDealDetailProgressStages(this.dealStatuses()));
  protected readonly isAdminViewer = computed(() => this.userScope.isAdminSession());
  protected readonly canAssignDeals = computed(() => this.permissions.canAssignDeals());

  protected readonly dealOwnerOptions = this.ownerOpts.options;

  protected readonly isDealReadOnly = computed(() => {
    const row = this.deal();
    if (!row) return false;
    const pipeline = toDealPipelineRows(this.dealStatuses());
    if (pipeline.length > 0) return isClosedStatus(pipeline, row.status);
    return isDealClosed(row.status);
  });

  protected readonly isStatusLocked = this.isDealReadOnly;

  protected readonly statusLockedMessage = computed(() => {
    const row = this.deal();
    if (!row) return '';
    const pipeline = toDealPipelineRows(this.dealStatuses());
    const closed =
      pipeline.length > 0 ? isClosedStatus(pipeline, row.status) : isDealClosed(row.status);
    if (!closed) return '';
    return DEAL_STAGE_CLOSED_MESSAGE;
  });

  protected readonly currentProgressIndex = computed(() => {
    const row = this.deal();
    const stages = this.progressStages();
    if (!row || stages.length === 0) return 0;

    const idx = dealDetailProgressIndex(row.status, stages);
    if (idx >= 0) return idx;

    const pipeline = toDealPipelineRows(this.dealStatuses());
    const isLost =
      pipeline.length > 0
        ? isClosedLostStatus(pipeline, row.status)
        : isDealClosedLost(row.status);
    if (isLost) {
      for (let i = stages.length - 1; i >= 0; i--) {
        const stage = stages[i];
        const hit = this.stageHistory().some((h) =>
          dealStatusMatchesProgressStage(h.newStage, stage),
        );
        if (hit) return i;
      }
      const lastOpenIdx = stages.reduce(
        (best, s, i) => (!s.isWon && !s.isLost ? i : best),
        0,
      );
      return lastOpenIdx;
    }
    return 0;
  });

  private readonly noteRelatedTypeLabels: Record<NoteRelatedType, string> = {
    lead: 'Lead',
    deal: 'Deal',
    contact: 'Contact',
    organization: 'Organization',
  };

  protected readonly dataForm = this.fb.nonNullable.group({
    organization: ['', Validators.required],
    annualRevenue: [''],
    dealAmount: [''],
    status: this.fb.nonNullable.control<string>(DEFAULT_DEAL_PIPELINE_STATUS, Validators.required),
    stageComment: [''],
    email: ['', [Validators.email]],
    mobile: [''],
    dealOwner: [this.ownerOpts.defaultOwnerId(), Validators.required],
    website: [''],
    gst: ['', gstFormValidators()],
    territory: [''],
    probabilityPercent: ['10'],
    nextStep: [''],
  });

  constructor() {
    this.ownerOpts.load();
    this.dealMaster.ensureStatusesLoaded().pipe(take(1)).subscribe();
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(id)) {
        this.numericId.set(null);
        this.deal.set(null);
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
      this.dealMaster
        .ensureStatusesLoaded()
        .pipe(
          switchMap(() => this.dealsService.getById(id)),
          take(1),
        )
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
            this.refreshDealTasks();
            this.refreshDealNotes();
            this.refreshDealActivities();
            const did = row.id.trim();
            if (did) {
              this.loadDealAttachments(did);
              this.refreshDealComments();
              this.refreshDealEmails();
            } else {
              this.dealAttachments.set([]);
              this.dealComments.set([]);
              this.dealEmails.set([]);
            }
            this.commentComposerOpen.set(false);
            this.commentDraft.set('');
            this.emailComposerOpen.set(false);
            this.emailComposeEmojiOpen.set(false);
            this.refreshDealQuotation();
            this.refreshStageHistory();
          } else {
            this.dealTasks.set([]);
            this.dealNotes.set([]);
            this.dealActivityGroups.set([]);
            this.dealAttachments.set([]);
            this.dealComments.set([]);
            this.dealEmails.set([]);
            this.dealQuotationId.set(null);
            this.stageHistory.set([]);
            this.commentComposerOpen.set(false);
            this.commentDraft.set('');
            this.emailComposerOpen.set(false);
            this.emailComposeEmojiOpen.set(false);
          }
        });
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((query) => {
      const tab = parseEntityDetailTab(query.get('tab'));
      if (tab) this.setTab(tab);
    });

    this.createRowBus.created$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.kind === 'task') {
        this.refreshDealTasks();
        this.refreshDealActivities();
      }
      if (e.kind === 'note') {
        this.refreshDealNotes();
        this.refreshDealActivities();
      }
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
      .getByRelatedDeal(did)
      .pipe(take(1))
      .subscribe((rows) => {
        this.dealTasks.set(rows);
      });
  }

  private refreshDealActivities(): void {
    const id = this.numericId();
    if (id == null) {
      this.dealActivityGroups.set([]);
      return;
    }
    this.dealActivityLoading.set(true);
    this.activitiesService
      .getDealGroups(id)
      .pipe(take(1))
      .subscribe({
        next: (groups) => {
          this.dealActivityGroups.set(groups);
          this.dealActivityLoading.set(false);
        },
        error: () => {
          this.dealActivityGroups.set([]);
          this.dealActivityLoading.set(false);
        },
      });
  }

  private refreshDealNotes(): void {
    const id = this.numericId();
    if (id == null) {
      this.dealNotes.set([]);
      return;
    }
    this.notesService
      .getByRecord(id)
      .pipe(take(1))
      .subscribe({
        next: (rows) => this.dealNotes.set(rows),
        error: () => this.dealNotes.set([]),
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
    const addedNames: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      addedNames.push(file.name);
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
    this.logAttachmentActivities('deal', addedNames);
  }

  private logAttachmentActivities(entityType: 'deal', fileNames: string[]): void {
    const id = this.numericId();
    if (id == null || !fileNames.length) return;

    const actor = this.auth.user()?.name?.trim() || 'User';
    const requests = fileNames.map((name) =>
      this.activitiesService
        .logAttachmentAdded(entityType, id, `${actor} added attachment: ${name}`)
        .pipe(catchError(() => of(null))),
    );

    forkJoin(requests)
      .pipe(take(1))
      .subscribe(() => this.refreshDealActivities());
  }

  private refreshDealComments(): void {
    const id = this.numericId();
    if (id == null) {
      this.dealComments.set([]);
      return;
    }
    this.commentsService
      .listForEntity('deal', id)
      .pipe(take(1))
      .subscribe({
        next: (rows) => this.dealComments.set(rows),
        error: () => this.dealComments.set([]),
      });
  }

  protected openNewCommentFromDeal(): void {
    this.commentComposerOpen.set(true);
  }

  protected cancelDealCommentComposer(): void {
    this.commentComposerOpen.set(false);
    this.commentDraft.set('');
  }

  protected postDealComment(): void {
    const id = this.numericId();
    const text = this.commentDraft().trim();
    if (id == null || !text || this.commentPosting()) return;

    this.commentPosting.set(true);
    this.commentsService
      .createForEntity('deal', id, text)
      .pipe(take(1))
      .subscribe({
        next: (row) => {
          this.dealComments.update((list) => [row, ...list]);
          this.commentDraft.set('');
          this.commentComposerOpen.set(false);
          this.commentPosting.set(false);
          this.refreshDealActivities();
          this.toast.success('Comment posted.');
        },
        error: () => {
          this.commentPosting.set(false);
          this.toast.error('Could not post comment. Try again.');
        },
      });
  }

  private refreshDealEmails(): void {
    const id = this.numericId();
    if (id == null) {
      this.dealEmails.set([]);
      return;
    }
    this.dealEmailsLoading.set(true);
    this.emailsService
      .listForEntity('deal', id)
      .pipe(take(1))
      .subscribe({
        next: (rows) => {
          this.dealEmails.set(rows);
          this.dealEmailsLoading.set(false);
        },
        error: () => {
          this.dealEmails.set([]);
          this.dealEmailsLoading.set(false);
        },
      });
  }

  protected openReplyFromDealComments(): void {
    this.setTab('Emails');
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
    const id = this.numericId();
    if (id == null || this.emailSending()) return;

    const to = this.emailTo().trim();
    const subject = this.emailSubject().trim();
    const body = this.emailBody().trim();
    if (!this.emailComposeValid()) return;

    this.emailSending.set(true);
    this.emailsService
      .sendForEntity({
        entityType: 'deal',
        entityId: id,
        toEmail: to,
        subject,
        body,
        isHtml: true,
      })
      .pipe(take(1))
      .subscribe({
        next: (row) => {
          this.dealEmails.update((list) => [row, ...list]);
          this.emailBody.set('');
          this.emailComposerOpen.set(false);
          this.emailComposeEmojiOpen.set(false);
          this.emailSending.set(false);
          this.refreshDealActivities();
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

  protected openDealEmailComposer(): void {
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected openDealEmailReply(thread?: EntityEmailItem): void {
    if (thread?.subjectLine) {
      const subj = thread.subjectLine.trim();
      this.emailSubjectText.set(/^re:/i.test(subj) ? subj : `Re: ${subj}`);
    }
    this.emailComposeEmojiOpen.set(false);
    this.emailComposerOpen.set(true);
  }

  protected openDealEmailFooterComment(): void {
    this.setTab('Comments');
  }

  protected openNewTaskFromDeal(): void {
    const d = this.deal();
    if (!d?.id) return;
    this.createFlow.selectEntity('task', {
      taskFromLead: {
        relatedDealId: String(d.id),
        recordOwnerUserId: dealRecordOwnerUserId(d),
      },
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
        recordOwnerUserId: dealRecordOwnerUserId(d),
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

  private refreshStageHistory(): void {
    const id = this.numericId();
    if (id == null) {
      this.stageHistory.set([]);
      return;
    }
    this.dealsService
      .getStageHistory(id)
      .pipe(take(1))
      .subscribe({
        next: (rows) => this.stageHistory.set(rows),
        error: () => this.stageHistory.set([]),
      });
  }

  protected progressStageState(stageIndex: number): DealProgressStageVisualState {
    const row = this.deal();
    if (!row) return 'pending';
    const current = this.currentProgressIndex();
    const pipeline = toDealPipelineRows(this.dealStatuses());
    const isLost =
      pipeline.length > 0
        ? isClosedLostStatus(pipeline, row.status)
        : isDealClosedLost(row.status);
    if (isLost) {
      if (stageIndex < current) return 'completed';
      if (stageIndex === current) return 'current';
      return 'pending';
    }
    return dealProgressStageVisualState(stageIndex, current);
  }

  protected isProgressLostStage(stage: DealDetailProgressStage): boolean {
    return stage.isLost;
  }

  protected isProgressWonStage(stage: DealDetailProgressStage): boolean {
    return stage.isWon;
  }

  protected progressStageTooltip(stage: DealDetailProgressStage, stageIndex: number): string {
    const fullName = stage.name?.trim();
    const state = this.progressStageState(stageIndex);
    const stateLabel = state === 'completed' ? 'Completed' : state === 'current' ? 'Current' : 'Pending';
    const date = this.progressStageDateLabel(stage);
    if (date) return `${fullName} (${stateLabel}) — ${date}`;
    return `${fullName} (${stateLabel})`;
  }

  protected progressStageDateLabel(stage: DealDetailProgressStage): string | null {
    const match = this.stageHistory().find((h) =>
      dealStatusMatchesProgressStage(h.newStage, stage),
    );
    if (!match?.changedAt) return null;
    const t = Date.parse(match.changedAt);
    if (Number.isNaN(t)) return null;
    try {
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(t);
    } catch {
      return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
  }

  protected isProgressStageDisabled(stage: DealDetailProgressStage, stageIndex: number): boolean {
    if (this.isDealReadOnly() || this.progressUpdating() || this.progressStageState(stageIndex) === 'current') {
      return true;
    }
    const row = this.deal();
    if (!row) return true;
    return !canSelectDealStage({
      fromStatus: row.status,
      toStatus: stage.name,
      stageHistory: this.stageHistory(),
      statusOptions: this.dealStatuses(),
    });
  }

  protected onProgressStageClick(stage: DealDetailProgressStage): void {
    const stageIndex = this.progressStages().findIndex((s) => s.dealStatusId === stage.dealStatusId);
    if (this.isProgressStageDisabled(stage, stageIndex)) {
      const row = this.deal();
      if (!row || this.isDealReadOnly()) return;
      const result = validateDealStageTransition({
        fromStatus: row.status,
        toStatus: stage.name,
        stageHistory: this.stageHistory(),
        statusOptions: this.dealStatuses(),
      });
      if (!result.allowed && result.message) {
        this.toast.error(result.message);
      }
      return;
    }

    const row = this.deal();
    const idn = this.numericId();
    if (!row || idn == null) return;

    const target = resolveDealStatusLabel(stage.name);
    if (resolveDealStatusLabel(row.status) === target) return;

    const opt =
      this.dealStatuses().find((o) => o.id === stage.dealStatusId) ??
      this.dealStatuses().find((o) => resolveDealStatusLabel(o.name) === target);
    const formValue = opt ? masterOptionFormValue(opt) : target;

    this.dataForm.controls.status.setValue(formValue);
    this.dataForm.controls.status.markAsDirty();
    this.requestStageChange(row, idn);
  }

  protected cancelLostReasonModal(): void {
    const row = this.deal();
    this.lostReasonModalOpen.set(false);
    this.lostReasonDraft.set('');
    this.pendingLostStage.set(null);
    if (row) this.patchDataForm(row);
  }

  protected submitLostReasonModal(): void {
    const row = this.deal();
    const idn = this.numericId();
    const reason = this.lostReasonDraft().trim();
    if (!row || idn == null || !reason) {
      this.toast.error('Lost reason is required.');
      return;
    }
    this.lostReasonModalOpen.set(false);
    this.pendingLostStage.set(null);
    this.requestStageChange(row, idn, reason);
  }

  private revenueNumberToInputString(value: number | undefined): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '';
    return value.toLocaleString('en-IN');
  }

  protected patchDataForm(row: DealRow): void {
    const ownerId = this.ownerOpts.resolveDealSelectValue(row);
    const emailVal = row.email?.trim();
    const mobileVal = row.mobile?.trim();
    const prob = row.probabilityPercent ?? 10;
    this.dataForm.patchValue(
      {
        organization: row.organizationName ?? '',
        annualRevenue: this.revenueNumberToInputString(row.annualRevenue),
        dealAmount: this.revenueNumberToInputString(row.dealAmount),
        status: resolveDealStatusSelectValue(
          row.dealStatusId,
          row.status,
          this.dealMaster.statusSelectOptions(),
        ),
        email: emailVal && emailVal !== '—' ? emailVal : '',
        mobile: mobileVal && mobileVal !== '—' ? mobileVal : '',
        dealOwner: ownerId || this.ownerOpts.defaultOwnerId(),
        website: row.website?.trim() ?? '',
        gst: normalizeGstin(row.gst),
        territory: masterSelectControlValue(
          row.territoryId,
          row.territory,
          this.dealMaster.territorySelectOptions(),
        ),
        probabilityPercent:
          Number.isFinite(prob) ? (Math.round(prob * 1000) / 1000).toFixed(3) : '10.000',
        nextStep: row.nextStep ?? '',
        stageComment: '',
      },
      { emitEvent: false },
    );
    this.dataForm.markAsPristine();
    if (isDealClosed(row.status)) {
      this.dataForm.disable({ emitEvent: false });
    } else {
      this.dataForm.enable({ emitEvent: false });
    }
  }

  protected noteRelatedLabel(note: NoteRow): string {
    const label = this.noteRelatedTypeLabels[note.relatedType] ?? note.relatedType;
    const suffix = note.visibility === 'private' ? ' · Private' : '';
    return `${label} · ${note.relatedName}${suffix}`;
  }

  protected setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    if (tab === 'Activity') this.refreshDealActivities();
    if (tab === 'Comments') this.refreshDealComments();
    if (tab === 'Emails') this.refreshDealEmails();
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

  protected readonly gstinErrorMessage = GSTIN_ERROR_MESSAGE;
  protected readonly gstinErrorKey = GSTIN_ERROR_KEY;

  protected gstFieldInvalid(): boolean {
    return gstControlInvalid(this.dataForm.controls.gst);
  }

  protected onGstinInput(ev: Event): void {
    syncGstinInputFromEvent(ev, this.dataForm.controls.gst);
  }

  protected discardDataEdits(): void {
    const row = this.deal();
    if (row) this.patchDataForm(row);
  }

  /** Header pipeline dropdown — saves immediately (same as deals list). */
  protected onHeaderPipelineStatusChange(): void {
    const row = this.deal();
    const idn = this.numericId();
    if (!row || idn == null || !this.dataForm.controls.status.dirty) return;
    if (this.isDealReadOnly()) {
      this.toast.error(this.statusLockedMessage());
      this.patchDataForm(row);
      return;
    }
    this.requestStageChange(row, idn);
  }

  private requestStageChange(row: DealRow, idn: number, lostReason?: string): void {
    const v = this.dataForm.getRawValue();
    const statPick = resolveOrgMasterPick(v.status, this.dealMaster.statusSelectOptions());
    const status = resolveDealStatusLabel(statPick.label || v.status);

    const pipeline = toDealPipelineRows(this.dealStatuses());
    const validation = validateDealStageTransition({
      fromStatus: row.status,
      toStatus: status,
      stageHistory: this.stageHistory(),
      lostReason,
      statusOptions: this.dealStatuses(),
    });

    if (!validation.allowed) {
      const closingLost =
        pipeline.length > 0 ? isClosedLostStatus(pipeline, status) : isDealClosedLost(status);
      if (closingLost && validation.message?.includes('Lost reason')) {
        this.pendingLostStage.set({
          status,
          name: statPick.label || status,
          dealStatusId: statPick.masterId ?? 0,
        });
        this.lostReasonDraft.set('');
        this.lostReasonModalOpen.set(true);
        return;
      }
      this.toast.error(validation.message ?? 'This stage change is not allowed.');
      this.patchDataForm(row);
      return;
    }

    this.applyPipelineStatusChange(row, idn, lostReason);
  }

  private applyPipelineStatusChange(row: DealRow, idn: number, lostReason?: string): void {
    const v = this.dataForm.getRawValue();
    const statPick = resolveOrgMasterPick(v.status, this.dealMaster.statusSelectOptions());
    const status = resolveDealStatusLabel(statPick.label || v.status);
    const comment = v.stageComment.trim() || undefined;

    this.dataSaving.set(true);
    this.progressUpdating.set(true);
    this.dealsService
      .updateStatus(idn, {
        status,
        dealStatusId: statPick.masterId,
        comment,
        lostReason: lostReason?.trim() || undefined,
      })
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.dataSaving.set(false);
          this.progressUpdating.set(false);
          this.lostReasonDraft.set('');
          if (updated) {
            this.deal.set(updated);
            this.patchDataForm(updated);
            this.refreshDealActivities();
            this.refreshStageHistory();
            this.toast.success(`Stage updated to ${status}.`);
          }
        },
        error: (e: unknown) => {
          this.dataSaving.set(false);
          this.progressUpdating.set(false);
          this.toast.error(leadsHttpErrorMessage(e));
          this.patchDataForm(row);
        },
      });
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
    const opt = this.dealOwnerOptions().find((o) => o.id === id);
    const label = opt?.label?.trim();
    if (label) return label.charAt(0).toUpperCase();
    const fb = this.deal()?.assignedTo?.trim();
    return fb ? fb.charAt(0).toUpperCase() : '?';
  }

  protected saveDataTab(): void {
    const row = this.deal();
    const idn = this.numericId();
    if (!row || idn == null) return;

    if (this.isDealReadOnly()) {
      this.toast.error(this.statusLockedMessage());
      return;
    }

    if (this.dataForm.invalid) {
      this.dataForm.markAllAsTouched();
      return;
    }

    const payload = this.buildDirtyDealSavePatch(row);
    const statusDirty = this.dataForm.controls.status.dirty;
    const hasOtherChanges = Object.keys(payload).some((k) => k !== 'lastModified' && k !== 'status' && k !== 'dealStatusId');
    if (!statusDirty && !hasOtherChanges) return;

    const v = this.dataForm.getRawValue();
    let save$;
    if (statusDirty) {
      const statPick = resolveOrgMasterPick(v.status, this.dealMaster.statusSelectOptions());
      const status = resolveDealStatusLabel(statPick.label || v.status);
      const pipeline = toDealPipelineRows(this.dealStatuses());
      const validation = validateDealStageTransition({
        fromStatus: row.status,
        toStatus: status,
        stageHistory: this.stageHistory(),
        statusOptions: this.dealStatuses(),
      });
      if (!validation.allowed) {
        const closingLost =
          pipeline.length > 0 ? isClosedLostStatus(pipeline, status) : isDealClosedLost(status);
        if (closingLost) {
          this.pendingLostStage.set({
            status,
            name: statPick.label || status,
            dealStatusId: statPick.masterId ?? 0,
          });
          this.lostReasonDraft.set('');
          this.lostReasonModalOpen.set(true);
          return;
        }
        this.toast.error(validation.message ?? 'This stage change is not allowed.');
        return;
      }
      const comment = v.stageComment.trim() || undefined;
      delete payload.status;
      delete payload.dealStatusId;
      save$ = this.dealsService.updateStatus(idn, {
        status,
        dealStatusId: statPick.masterId,
        comment,
      });
      if (hasOtherChanges) {
        save$ = save$.pipe(switchMap(() => this.dealsService.update(idn, payload)));
      }
    } else {
      save$ = this.dealsService.update(idn, payload);
    }

    this.dataSaving.set(true);

    save$
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.dataSaving.set(false);
          if (updated) {
            this.deal.set(updated);
            this.patchDataForm(updated);
            const org = updated.organizationName.trim() || 'Deal';
            this.emailSubjectText.set(`${org} (${this.dealCode()})`);
            this.refreshDealActivities();
            this.refreshStageHistory();
            const ownerDirty = this.dataForm.controls.dealOwner.dirty;
            const otherDirty =
              this.dataForm.controls.organization.dirty ||
              this.dataForm.controls.annualRevenue.dirty ||
              this.dataForm.controls.dealAmount.dirty ||
              this.dataForm.controls.status.dirty ||
              this.dataForm.controls.email.dirty ||
              this.dataForm.controls.mobile.dirty ||
              this.dataForm.controls.website.dirty ||
              this.dataForm.controls.gst.dirty ||
              this.dataForm.controls.territory.dirty ||
              this.dataForm.controls.probabilityPercent.dirty ||
              this.dataForm.controls.nextStep.dirty;
            if (ownerDirty && !otherDirty) {
              const name = updated.assignedTo?.trim() || '—';
              this.toast.success(
                name === '—' ? 'Deal owner cleared.' : `Deal owner changed to ${name}.`,
              );
            } else {
              this.toast.success('Deal saved.');
            }
          }
        },
        error: (e: unknown) => {
          this.dataSaving.set(false);
          this.toast.error(leadsHttpErrorMessage(e));
        },
      });
  }

  /** Sends only fields the user actually edited so unrelated columns are not cleared on save. */
  private buildDirtyDealSavePatch(row: DealRow): Partial<Omit<DealRow, 'id'>> {
    const v = this.dataForm.getRawValue();
    const patch: Partial<Omit<DealRow, 'id'>> = {};

    if (this.dataForm.controls.organization.dirty) {
      patch.organizationName = v.organization.trim();
    }
    if (this.dataForm.controls.annualRevenue.dirty) {
      patch.annualRevenue = parseRevenueInputToNumber(v.annualRevenue);
    }
    if (this.dataForm.controls.dealAmount.dirty) {
      patch.dealAmount = parseRevenueInputToNumber(v.dealAmount);
    }
    if (this.dataForm.controls.status.dirty) {
      const statPick = resolveOrgMasterPick(v.status, this.dealMaster.statusSelectOptions());
      patch.status = resolveDealStatusLabel(statPick.label || v.status);
      patch.dealStatusId = statPick.masterId;
    }
    if (this.dataForm.controls.email.dirty) {
      patch.email = v.email.trim() || '—';
    }
    if (this.dataForm.controls.mobile.dirty) {
      patch.mobile = v.mobile.trim() || '—';
    }
    if (this.canAssignDeals() && this.isAdminViewer() && this.dataForm.controls.dealOwner.dirty) {
      const opt = this.dealOwnerOptions().find((o) => o.id === v.dealOwner.trim());
      const ownerId = v.dealOwner.trim();
      patch.dealOwnerId = ownerId;
      patch.assignedToUserId = ownerId;
      patch.assignedTo = opt?.label ?? row.assignedTo;
      patch.assignedInitials = opt?.initials ?? row.assignedInitials;
    }
    if (this.dataForm.controls.website.dirty) {
      patch.website = v.website.trim();
    }
    if (this.dataForm.controls.gst.dirty) {
      patch.gst = normalizeGstin(v.gst);
    }
    if (this.dataForm.controls.territory.dirty) {
      const terrPick = resolveOrgMasterPick(v.territory, this.dealMaster.territorySelectOptions());
      patch.territory = terrPick.label.trim();
      patch.territoryId = terrPick.masterId;
    }
    if (this.dataForm.controls.probabilityPercent.dirty) {
      let probabilityPercent = row.probabilityPercent ?? 10;
      const rawProb = String(v.probabilityPercent ?? '').replace(/,/g, '').trim();
      if (rawProb !== '') {
        const p = Number.parseFloat(rawProb);
        if (Number.isFinite(p)) probabilityPercent = p;
      }
      patch.probabilityPercent = probabilityPercent;
    }
    if (this.dataForm.controls.nextStep.dirty) {
      patch.nextStep = v.nextStep.trim();
    }

    if (Object.keys(patch).length > 0) {
      patch.lastModified = 'Just now';
    }

    return patch;
  }

  protected openCreatePicker(): void {
    this.createFlow.openPicker();
  }

  protected onViewQuotation(): void {
    const qid = this.dealQuotationId();
    if (qid != null) {
      void this.router.navigate(['/quotations', qid]);
    }
  }

  protected onCreateQuotation(): void {
    const idn = this.numericId();
    const row = this.deal();
    if (idn == null || !row) {
      this.toast.error('Deal not loaded.');
      return;
    }
    const v = this.dataForm.getRawValue();
    const prefill = buildDealQuotationPrefill(
      idn,
      row,
      {
        organization: v.organization,
        email: v.email,
        mobile: v.mobile,
        website: v.website,
        gst: normalizeGstin(v.gst),
        annualRevenue: v.annualRevenue,
        territory: v.territory,
        employees: masterSelectControlValue(
          row.employeeCountId,
          row.employees,
          this.dealMaster.employeeSelectOptions(),
        ),
        industry: masterSelectControlValue(
          row.industryId,
          row.industry,
          this.dealMaster.industrySelectOptions(),
        ),
        salutation: '',
      },
      this.dealCode(),
    );
    storeDealQuotationPrefill(prefill);
    void this.router.navigate(['/quotations/new'], {
      queryParams: { dealId: idn },
      state: { dealPrefill: prefill },
    });
  }

  private refreshDealQuotation(): void {
    const dealId = this.numericId();
    if (dealId == null || dealId <= 0) {
      this.dealQuotationId.set(null);
      return;
    }
    this.quotationsService
      .list({ dealId })
      .pipe(take(1))
      .subscribe({
        next: (items) => {
          const latest = items.length > 0 ? items[0] : null;
          this.dealQuotationId.set(latest?.id ?? null);
        },
        error: () => this.dealQuotationId.set(null),
      });
  }

  protected sidebarAnnualRevenueLabel(): string {
    const raw = this.dataForm.controls.annualRevenue.value?.trim() ?? '';
    const n = parseRevenueInputToNumber(raw);
    if (n == null || !Number.isFinite(n) || n === 0) return '₹ 0.00';
    return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  protected dealPrimaryContactName(): string {
    const d = this.deal();
    if (!d) return 'Contact';
    const name = [d.firstName?.trim(), d.lastName?.trim()].filter(Boolean).join(' ');
    if (name) return name;
    const local = d.email?.split('@')[0]?.trim();
    return local || d.email?.trim() || 'Contact';
  }

  protected dealPrimaryContactInitial(): string {
    const n = this.dealPrimaryContactName();
    const c = n.replace(/[^a-zA-Z0-9]/g, '').charAt(0) || n.charAt(0);
    return c ? c.toUpperCase() : '?';
  }

  protected headerStatusDotClass(): string {
    const raw = this.dataForm.controls.status.value;
    const statPick = resolveOrgMasterPick(raw, this.dealMaster.statusSelectOptions());
    const label = statPick.label || this.deal()?.status || raw;
    const s = resolveDealStatusLabel(label);
    const kind = dealStatusCssKind(s);
    switch (kind) {
      case 'won':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--won';
      case 'lost':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--lost';
      case 'accent':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--accent';
      case 'demo':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--demo';
      default:
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--muted';
    }
  }

  /** Contacts header + button → related contact detail or Data tab for editing. */
  protected openDealContactTarget(): void {
    const cid = this.deal()?.relatedContactId?.trim();
    if (cid) void this.router.navigate(['/contacts', cid]);
    else this.setTab('Data');
  }

  protected confirmDeleteDeal(): void {
    if (!this.isAdminViewer() || this.isDealReadOnly()) return;
    const idn = this.numericId();
    if (idn == null) return;
    if (!confirm('Delete this deal?')) return;
    this.dealsService
      .delete(idn)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toast.success('Deal deleted.');
          void this.router.navigateByUrl('/deals');
        },
        error: (e: unknown) => this.toast.error(leadsHttpErrorMessage(e)),
      });
  }
}

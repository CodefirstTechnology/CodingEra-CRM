import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CreateRowBusService } from '../../core/create-flow/create-row-bus.service';
import { ActivitiesService } from '../../core/services/activities.service';
import type { ActivityGroup } from '../../core/services/activities/activity-api.models';
import { CommentsService } from '../../core/services/comments.service';
import type { EntityCommentItem } from '../../core/services/comments/comment-api.models';
import { DealsService } from '../../core/services/deals.service';
import { leadsHttpErrorMessage } from '../../core/services/leads.service';
import { TasksService } from '../../core/services/tasks.service';
import { NotesService } from '../../core/services/notes.service';
import { EmailsService, emailSendErrorMessage } from '../../core/services/emails.service';
import type { EntityEmailItem } from '../../core/services/emails/email-api.models';
import { ToastService } from '../../core/toast/toast.service';
import { EntityActivityTimelineComponent } from '../../shared/components/entity-activity-timeline/entity-activity-timeline.component';
import { parseEntityDetailTab } from '../../shared/utils/entity-record-nav.util';
import type { DealOwnerOption, DealPipelineStatus, DealRow } from './deals.component';
import { parseRevenueInputToNumber } from '../../shared/utils/revenue-parse';
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
  private readonly activitiesService = inject(ActivitiesService);
  private readonly commentsService = inject(CommentsService);
  private readonly emailsService = inject(EmailsService);
  private readonly tasksService = inject(TasksService);
  private readonly notesService = inject(NotesService);
  private readonly toast = inject(ToastService);
  private readonly createRowBus = inject(CreateRowBusService);
  private readonly createFlow = inject(CreateFlowService);
  protected readonly auth = inject(AuthService);

  protected readonly numericId = signal<number | null>(null);
  protected readonly deal = signal<DealRow | null>(null);
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

  protected readonly sidebarDetailsOpen = signal(true);
  protected readonly sidebarContactsOpen = signal(true);
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
    website: [''],
    territory: [''],
    probabilityPercent: ['10'],
    nextStep: [''],
  });

  constructor() {
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
          } else {
            this.dealTasks.set([]);
            this.dealNotes.set([]);
            this.dealActivityGroups.set([]);
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

  protected toggleSidebarContacts(): void {
    this.sidebarContactsOpen.update((o) => !o);
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
    const prob = row.probabilityPercent ?? 10;
    this.dataForm.patchValue(
      {
        organization: row.organizationName ?? '',
        annualRevenue: this.revenueNumberToInputString(row.annualRevenue),
        status: row.status,
        email: emailVal && emailVal !== '—' ? emailVal : '',
        mobile: mobileVal && mobileVal !== '—' ? mobileVal : '',
        dealOwner: ownerOpt?.id ?? 'SK',
        website: row.website?.trim() ?? '',
        territory: row.territory ?? '',
        probabilityPercent:
          Number.isFinite(prob) ? (Math.round(prob * 1000) / 1000).toFixed(3) : '10.000',
        nextStep: row.nextStep ?? '',
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

    const payload = this.buildDirtyDealSavePatch(row);
    if (Object.keys(payload).length <= 1) return;

    this.dataSaving.set(true);

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
            this.refreshDealActivities();
            const ownerDirty = this.dataForm.controls.dealOwner.dirty;
            const otherDirty =
              this.dataForm.controls.organization.dirty ||
              this.dataForm.controls.annualRevenue.dirty ||
              this.dataForm.controls.status.dirty ||
              this.dataForm.controls.email.dirty ||
              this.dataForm.controls.mobile.dirty ||
              this.dataForm.controls.website.dirty ||
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
    if (this.dataForm.controls.status.dirty) {
      patch.status = v.status;
    }
    if (this.dataForm.controls.email.dirty) {
      patch.email = v.email.trim() || '—';
    }
    if (this.dataForm.controls.mobile.dirty) {
      patch.mobile = v.mobile.trim() || '—';
    }
    if (this.dataForm.controls.dealOwner.dirty) {
      const opt = this.dealOwnerOptions.find((o) => o.id === v.dealOwner.trim());
      patch.dealOwnerId = v.dealOwner.trim();
      patch.assignedTo = opt?.label ?? row.assignedTo;
      patch.assignedInitials = opt?.initials ?? row.assignedInitials;
    }
    if (this.dataForm.controls.website.dirty) {
      patch.website = v.website.trim();
    }
    if (this.dataForm.controls.territory.dirty) {
      patch.territory = v.territory.trim();
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

  protected onCreateQuotationDemo(): void {
    /* Demo: quotation builder not wired in this CRM shell. */
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
    const s = this.dataForm.controls.status.value;
    switch (s) {
      case 'Closed Won':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--won';
      case 'Closed Lost':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--lost';
      case 'Negotiation':
      case 'Proposal':
        return 'deal-detail__hdr-status-dot deal-detail__hdr-status-dot--accent';
      case 'Demo/Making':
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

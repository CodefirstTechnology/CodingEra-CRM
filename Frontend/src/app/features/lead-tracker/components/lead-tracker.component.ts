import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, take } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ID_ADMIN } from '../../../core/auth/auth-role.util';
import { CrmModalComponent } from '../../../core/modal/crm-modal.component';
import { TasksService } from '../../../core/services/tasks.service';
import { LeadOwnerOptionsService } from '../../../core/services/leads/lead-owner-options.service';
import { ToastService } from '../../../core/toast/toast.service';
import type { TaskRow } from '../../tasks/tasks.component';
import {
  LeadTrackerService,
  LeadTrackerRow,
  LeadTrackerSummaryDto,
  LeadTrackerQueryParams
} from '../services/lead-tracker.service';

@Component({
  selector: 'app-lead-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, CrmModalComponent],
  templateUrl: './lead-tracker.component.html',
  styleUrls: ['./lead-tracker.component.scss']
})
export class LeadTrackerComponent implements OnInit {
  private readonly trackerService = inject(LeadTrackerService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly tasksService = inject(TasksService);
  private readonly leadOwnerOpts = inject(LeadOwnerOptionsService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  // State Signals
  readonly rows = signal<LeadTrackerRow[]>([]);
  readonly summary = signal<LeadTrackerSummaryDto>({
    totalLeads: 0,
    openLeads: 0,
    wonLeads: 0,
    lostLeads: 0,
    totalEstimatedValue: 0,
    totalQuotationValue: 0,
    totalWonValue: 0
  });

  readonly totalCount = signal<number>(0);
  readonly totalPages = signal<number>(1);
  readonly loading = signal<boolean>(false);
  readonly exporting = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // Filter Signals
  readonly pageIndex = signal<number>(1);
  readonly pageSize = signal<number>(25);
  readonly sortBy = signal<string>('LeadIdNum');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  readonly searchTerm = signal<string>('');
  readonly filterSalesExec = signal<string>('');
  readonly filterStage = signal<string>('');
  readonly filterStatus = signal<string>('');
  readonly filterAgeing = signal<string>('');
  readonly filterFollowUp = signal<string>('');
  readonly filterStartDate = signal<string>('');
  readonly filterEndDate = signal<string>('');

  // Dropdown options
  readonly ageingOptions = [
    { label: 'All Buckets', value: '' },
    { label: '0-2 Days', value: '0-2 Days' },
    { label: '3-7 Days', value: '3-7 Days' },
    { label: '8-14 Days', value: '8-14 Days' },
    { label: '15+ Days', value: '15+ Days' },
    { label: '0-7 Days', value: '0-7 Days' },
    { label: '8-15 Days', value: '8-15 Days' },
    { label: '16-30 Days', value: '16-30 Days' },
    { label: '31-60 Days', value: '31-60 Days' },
    { label: '60+ Days', value: '60+ Days' }
  ];

  readonly followUpOptions = [
    { label: 'All Follow-ups', value: '' },
    { label: 'Overdue', value: 'Overdue' },
    { label: 'Today', value: 'Today' },
    { label: 'Upcoming', value: 'Upcoming' },
    { label: 'No Schedule', value: 'No Schedule' }
  ];

  readonly statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Open', value: 'Open' },
    { label: 'Won', value: 'Won' },
    { label: 'Lost', value: 'Lost' }
  ];

  // Schedule Follow-Up Modal State
  readonly selectedLeadForFollowUp = signal<LeadTrackerRow | null>(null);
  readonly followUpModalOpen = signal(false);
  readonly followUpSaving = signal(false);

  readonly followUpForm = this.fb.nonNullable.group({
    dueDate: ['', Validators.required],
    assigneeId: ['', Validators.required],
    type: ['Follow-up'],
    message: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  // Complete Follow-Up Modal State
  readonly selectedLeadForComplete = signal<LeadTrackerRow | null>(null);
  readonly completeModalOpen = signal(false);
  readonly completeSaving = signal(false);

  readonly completeForm = this.fb.nonNullable.group({
    outcomeNotes: ['', [Validators.required, Validators.maxLength(1000)]],
    logAsCallDone: [true],
    callOutcome: ['Connected'],
    scheduleNext: [false],
    nextDueDate: [''],
    nextMessage: [''],
  });

  protected readonly leadOwnerOptions = this.leadOwnerOpts.options;

  protected readonly modalOwnerOptions = computed(() => {
    const list = [...this.leadOwnerOptions()];
    const row = this.selectedLeadForFollowUp();
    if (row && row.salesExecutive) {
      const execId = row.salesExecutiveUserId ? String(row.salesExecutiveUserId) : '';
      const exists = list.some(
        (o) => (execId && o.id === execId) || o.label.toLowerCase() === row.salesExecutive.toLowerCase()
      );
      if (!exists && (execId || row.salesExecutive)) {
        list.unshift({
          id: execId || '0',
          label: row.salesExecutive,
          initials: row.salesExecutive.slice(0, 2).toUpperCase()
        });
      }
    }
    return list;
  });

  // Debounced search subject
  private readonly searchSubject = new Subject<string>();

  // Computed page bounds display
  readonly startRow = computed(() => {
    if (this.totalCount() === 0) return 0;
    return (this.pageIndex() - 1) * this.pageSize() + 1;
  });

  readonly endRow = computed(() => {
    return Math.min(this.pageIndex() * this.pageSize(), this.totalCount());
  });

  ngOnInit(): void {
    this.leadOwnerOpts.load();

    const queryExec = this.route.snapshot.queryParams['salesExecutive'];
    if (queryExec) {
      this.filterSalesExec.set(queryExec);
    } else {
      const user = this.auth.user();
      if (user && user.roleId !== ROLE_ID_ADMIN && user.name) {
        this.filterSalesExec.set(user.name);
      }
    }

    this.searchSubject.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe((term) => {
      this.searchTerm.set(term);
      this.pageIndex.set(1);
      this.loadData();
    });

    this.loadData();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  onFilterChange(): void {
    this.pageIndex.set(1);
    this.loadData();
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.filterSalesExec.set('');
    this.filterStage.set('');
    this.filterStatus.set('');
    this.filterAgeing.set('');
    this.filterFollowUp.set('');
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.pageIndex.set(1);
    this.loadData();
  }

  onSort(column: string): void {
    if (this.sortBy() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(column);
      this.sortDirection.set('asc');
    }
    this.loadData();
  }

  onPageChange(newPageIndex: number): void {
    if (newPageIndex >= 1 && newPageIndex <= this.totalPages()) {
      this.pageIndex.set(newPageIndex);
      this.loadData();
    }
  }

  onPageSizeChange(event: Event): void {
    const newSize = parseInt((event.target as HTMLSelectElement).value, 10);
    this.pageSize.set(newSize);
    this.pageIndex.set(1);
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    const params: LeadTrackerQueryParams = {
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      search: this.searchTerm() || undefined,
      salesExecutive: this.filterSalesExec() || undefined,
      stage: this.filterStage() || undefined,
      status: this.filterStatus() || undefined,
      ageingBucket: this.filterAgeing() || undefined,
      followUpStatus: this.filterFollowUp() || undefined,
      startDate: this.filterStartDate() || undefined,
      endDate: this.filterEndDate() || undefined
    };

    this.trackerService.getTrackerData(params).subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.totalCount.set(res.totalCount);
        this.totalPages.set(res.totalPages);
        this.summary.set(res.summary);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load lead tracker data', err);
        this.error.set('Failed to load Lead Tracker data. Please try again.');
        this.loading.set(false);
      }
    });
  }

  exportExcel(): void {
    this.exporting.set(true);
    const params: LeadTrackerQueryParams = {
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      search: this.searchTerm() || undefined,
      salesExecutive: this.filterSalesExec() || undefined,
      stage: this.filterStage() || undefined,
      status: this.filterStatus() || undefined,
      ageingBucket: this.filterAgeing() || undefined,
      followUpStatus: this.filterFollowUp() || undefined,
      startDate: this.filterStartDate() || undefined,
      endDate: this.filterEndDate() || undefined
    };

    this.trackerService.downloadExcel(params).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `Lead_Tracker_Export_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: (err) => {
        console.error('Failed to export Excel', err);
        alert('Failed to export Excel report.');
        this.exporting.set(false);
      }
    });
  }

  // Visual Badging & Helpers
  getStatusBadgeClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'won': return 'badge--green';
      case 'lost': return 'badge--red';
      default: return 'badge--blue';
    }
  }

  getAgeingBadgeClass(bucket: string): string {
    switch (bucket) {
      case '0-2 Days': return 'badge--green';
      case '3-7 Days': case '0-7 Days': return 'badge--teal';
      case '8-14 Days': case '8-15 Days': return 'badge--yellow';
      case '15+ Days': case '16-30 Days': case '31-60 Days': case '60+ Days': return 'badge--red';
      default: return 'badge--gray';
    }
  }

  getFollowUpBadgeClass(status: string): string {
    switch (status) {
      case 'Overdue': return 'badge--red';
      case 'Today': return 'badge--yellow';
      case 'Upcoming': return 'badge--green';
      case 'No Schedule': return 'badge--gray';
      default: return 'badge--gray';
    }
  }

  getYesNoBadgeClass(val: string): string {
    return (val || '').toLowerCase() === 'yes' ? 'badge--subtle-green' : 'badge--subtle-gray';
  }

  formatCurrency(val: number | null | undefined): string {
    if (val === null || val === undefined) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  }

  private defaultFollowUpDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  addFollowUp(row: LeadTrackerRow): void {
    this.selectedLeadForFollowUp.set(row);
    this.leadOwnerOpts.ensureLoaded().subscribe();

    let defaultOwner = '';
    if (row.salesExecutiveUserId) {
      defaultOwner = String(row.salesExecutiveUserId);
    } else if (row.salesExecutive) {
      const match = this.leadOwnerOpts.findByLabel(row.salesExecutive);
      if (match) defaultOwner = match.id;
    }
    if (!defaultOwner) {
      defaultOwner = this.leadOwnerOpts.defaultOwnerId() || (this.auth.user()?.id ?? '');
    }

    this.followUpForm.reset({
      dueDate: this.defaultFollowUpDate(),
      assigneeId: defaultOwner,
      type: 'Follow-up',
      message: '',
    });
    this.followUpForm.markAsUntouched();
    this.followUpModalOpen.set(true);
  }

  closeAddFollowUpModal(): void {
    this.followUpModalOpen.set(false);
    this.selectedLeadForFollowUp.set(null);
  }

  submitAddFollowUp(): void {
    this.followUpForm.markAllAsTouched();
    if (this.followUpForm.invalid || this.followUpSaving()) return;

    const row = this.selectedLeadForFollowUp();
    if (!row) return;

    const val = this.followUpForm.getRawValue();
    const ownerOpt = this.modalOwnerOptions().find((o) => o.id === val.assigneeId)
      ?? this.leadOwnerOpts.findById(val.assigneeId);
    const assigneeName = ownerOpt?.label ?? row.salesExecutive ?? 'Lead Owner';

    this.followUpSaving.set(true);

    const msgLower = (val.message || '').toLowerCase();
    const isMeeting = val.type === 'Meeting' || /meet|demo|visit|discussion|presentation/i.test(msgLower);
    const taskType = isMeeting ? 'Meeting' : (val.type || 'Task');
    const titlePrefix = isMeeting ? 'Meeting' : 'Follow up';

    const taskPayload: Omit<TaskRow, 'id'> = {
      title: `${titlePrefix}: ${row.customerName || row.contactPerson || 'Lead #' + row.leadIdNum}`,
      dailyImprovement: '',
      description: val.message.trim(),
      status: 'Todo',
      priority: 'Medium',
      taskType,
      dueDate: val.dueDate,
      dueDateRaw: val.dueDate,
      assignedTo: assigneeName,
      assignedToUserId: val.assigneeId,
      assignedInitials: ownerOpt?.initials ?? 'FO',
      lastModified: new Date().toISOString(),
      relatedLeadId: String(row.leadIdNum),
      relatedLeadName: row.customerName || row.contactPerson || '',
    };

    this.tasksService
      .create(taskPayload)
      .pipe(
        take(1),
        catchError((err) => {
          console.error('Failed to create follow-up task', err);
          this.toast.error('Failed to schedule follow-up.');
          this.followUpSaving.set(false);
          return of(null);
        }),
      )
      .subscribe((created) => {
        this.followUpSaving.set(false);
        if (!created) return;

        this.closeAddFollowUpModal();
        this.toast.success(isMeeting ? 'Meeting follow-up scheduled successfully.' : 'Follow-up scheduled successfully.');
        this.loadData();
      });
  }

  openCompleteFollowUp(row: LeadTrackerRow): void {
    this.selectedLeadForComplete.set(row);
    this.completeForm.reset({
      outcomeNotes: '',
      logAsCallDone: true,
      callOutcome: 'Connected',
      scheduleNext: false,
      nextDueDate: this.defaultFollowUpDate(),
      nextMessage: '',
    });
    this.completeForm.markAsUntouched();
    this.completeModalOpen.set(true);
  }

  closeCompleteFollowUpModal(): void {
    this.completeModalOpen.set(false);
    this.selectedLeadForComplete.set(null);
  }

  submitCompleteFollowUp(): void {
    const row = this.selectedLeadForComplete();
    if (!row) return;

    const taskId = row.pendingTaskId;
    if (!taskId || taskId <= 0) {
      this.toast.error('No active follow-up task found for this lead.');
      return;
    }

    this.completeForm.markAllAsTouched();
    if (this.completeForm.invalid || this.completeSaving()) return;

    const val = this.completeForm.getRawValue();
    if (val.scheduleNext && (!val.nextDueDate || !val.nextMessage.trim())) {
      this.toast.error('Please enter the next follow-up date and message.');
      return;
    }

    this.completeSaving.set(true);

    this.tasksService
      .completeFollowUp(taskId, {
        taskId,
        discussionNotes: val.outcomeNotes.trim(),
        logAsCallDone: val.logAsCallDone,
        callOutcome: val.callOutcome || 'Connected',
        durationSeconds: 60,
        scheduleNext: val.scheduleNext,
        nextDueDate: val.scheduleNext ? val.nextDueDate : undefined,
        nextMessage: val.scheduleNext ? val.nextMessage.trim() : undefined,
      })
      .pipe(
        take(1),
        catchError((err) => {
          console.error('Failed to complete follow-up', err);
          this.toast.error('Failed to complete follow-up.');
          this.completeSaving.set(false);
          return of(null);
        }),
      )
      .subscribe((res) => {
        this.completeSaving.set(false);
        if (!res) return;

        this.closeCompleteFollowUpModal();
        this.toast.success('Follow-up completed! Meeting and lead tracker updated.');
        this.loadData();
      });
  }
}

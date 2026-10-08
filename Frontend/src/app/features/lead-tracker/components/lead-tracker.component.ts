import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  LeadTrackerService,
  LeadTrackerRow,
  LeadTrackerSummaryDto,
  LeadTrackerQueryParams
} from '../services/lead-tracker.service';

@Component({
  selector: 'app-lead-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lead-tracker.component.html',
  styleUrls: ['./lead-tracker.component.scss']
})
export class LeadTrackerComponent implements OnInit {
  private readonly trackerService = inject(LeadTrackerService);

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
}

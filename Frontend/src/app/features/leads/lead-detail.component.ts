import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs/operators';
import { LeadsService } from '../../core/services/leads.service';
import type { LeadRow } from './leads.component';

type DetailTab = 'Activity' | 'Emails' | 'Comments' | 'Data' | 'Calls' | 'Tasks' | 'Notes' | 'Attachments';

@Component({
  selector: 'app-lead-detail',
  imports: [RouterLink],
  templateUrl: './lead-detail.component.html',
  styleUrl: './lead-detail.component.scss',
})
export class LeadDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly leadsService = inject(LeadsService);

  protected readonly lead = signal<LeadRow | null>(null);
  protected readonly activeTab = signal<DetailTab>('Activity');

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

  protected readonly leadCode = computed(() => {
    const id = this.lead()?.id ?? '0000';
    return `CRM-LEAD-${String(id).padStart(6, '0')}`;
  });

  protected readonly emailSubject = computed(() => {
    const name = this.lead()?.name || 'Lead';
    return `Mr ${name} (${this.leadCode()})`;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id)) {
        this.lead.set(null);
        return;
      }
      this.leadsService
        .getById(id)
        .pipe(take(1))
        .subscribe((row) => this.lead.set(row));
    });
  }

  protected setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  protected ownerInitial(): string {
    const owner = this.lead()?.leadOwnerName?.trim() || this.lead()?.owner?.trim() || 'L';
    return owner.charAt(0).toUpperCase();
  }

  protected leadInitial(): string {
    const name = this.lead()?.name?.trim() || 'L';
    return name.charAt(0).toUpperCase();
  }
}

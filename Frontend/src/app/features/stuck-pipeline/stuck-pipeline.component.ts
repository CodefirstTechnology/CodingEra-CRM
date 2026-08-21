import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CreateFlowService } from '../../core/create-flow/create-flow.service';
import { CrmModalComponent } from '../../core/modal/crm-modal.component';
import { formatIndianCurrency } from '../../shared/utils/format-inr.util';
import type { IdleLeadItem, StuckDealItem, StuckPipelineResponse } from '../../core/services/dashboard/stuck-pipeline.models';
import { StuckPipelineService } from '../../core/services/dashboard/stuck-pipeline.service';

@Component({
  selector: 'app-stuck-pipeline',
  standalone: true,
  imports: [RouterLink, FormsModule, CrmModalComponent],
  templateUrl: './stuck-pipeline.component.html',
  styleUrl: './stuck-pipeline.component.scss',
})
export class StuckPipelineComponent {
  private readonly stuckService = inject(StuckPipelineService);
  private readonly createFlow = inject(CreateFlowService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly data = signal<StuckPipelineResponse | null>(null);
  protected readonly activeTab = signal<'deals' | 'leads'>('deals');
  protected readonly searchQuery = signal('');

  // Quick Action Dialog state
  protected readonly noteModalOpen = signal(false);
  protected readonly noteModalTitle = signal('');
  protected readonly noteEntityId = signal<number | null>(null);
  protected readonly noteEntityType = signal<'deal' | 'lead'>('deal');
  protected readonly noteText = signal('');

  protected readonly user = this.auth.user;
  protected readonly backRoute = computed(() =>
    this.user()?.role === 'admin' ? '/dashboard' : '/user-dashboard',
  );

  protected readonly stuckDeals = computed(() => this.data()?.stuckDeals ?? []);
  protected readonly idleLeads = computed(() => this.data()?.idleLeads ?? []);
  protected readonly summary = computed(() => this.data()?.summary ?? null);

  protected readonly filteredStuckDeals = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const deals = this.stuckDeals();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.dealTitle.toLowerCase().includes(q) ||
        d.organizationName.toLowerCase().includes(q) ||
        d.contactName.toLowerCase().includes(q) ||
        d.stage.toLowerCase().includes(q) ||
        d.ownerName.toLowerCase().includes(q),
    );
  });

  protected readonly filteredIdleLeads = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const leads = this.idleLeads();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.leadName.toLowerCase().includes(q) ||
        l.organizationName.toLowerCase().includes(q) ||
        l.ownerName.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.mobile.toLowerCase().includes(q),
    );
  });

  constructor() {
    this.loadData();
  }

  protected loadData(): void {
    this.loading.set(true);
    this.stuckService
      .getStuckPipeline()
      .pipe(take(1))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.data.set(res);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  protected formatCurrency(val: number): string {
    return formatIndianCurrency(val);
  }

  protected setTab(tab: 'deals' | 'leads'): void {
    this.activeTab.set(tab);
    this.searchQuery.set('');
  }

  protected openCreateFollowUp(entityType: 'deal' | 'lead', entityId: number): void {
    this.createFlow.selectEntity('task');
  }

  protected openDeal(dealId: number): void {
    void this.router.navigate(['/deals', dealId]);
  }

  protected openLead(leadId: number): void {
    void this.router.navigate(['/leads', leadId]);
  }

  protected openAddNote(entityType: 'deal' | 'lead', entityId: number, name: string): void {
    this.noteEntityType.set(entityType);
    this.noteEntityId.set(entityId);
    this.noteModalTitle.set(`Add Note: ${name}`);
    this.noteText.set('');
    this.noteModalOpen.set(true);
  }

  protected closeNoteModal(): void {
    this.noteModalOpen.set(false);
    this.noteText.set('');
  }

  protected submitNote(): void {
    const text = this.noteText().trim();
    if (!text) return;
    // Handled or logged; close modal and refresh
    this.closeNoteModal();
    this.loadData();
  }
}

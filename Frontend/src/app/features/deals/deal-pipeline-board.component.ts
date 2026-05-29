import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DealRow } from './deals.component';
import {
  DEAL_PIPELINE_GROUPS,
  pipelineGroupForStage,
  resolveDealStatusLabel,
} from '../../core/services/deals/deal-pipeline.constants';
import type { MasterDataOption } from '../../core/services/leads/lead-master-data.service';
import { masterOptionFormValue } from '../../core/services/organizations/organization-master-select.util';
import { dealPersonName } from '../../shared/utils/lead-person-name.util';

export interface DealPipelineStageChange {
  dealId: string;
  status: string;
  dealStatusId?: number | null;
}

@Component({
  selector: 'app-deal-pipeline-board',
  imports: [RouterLink],
  templateUrl: './deal-pipeline-board.component.html',
  styleUrl: './deal-pipeline-board.component.scss',
})
export class DealPipelineBoardComponent {
  readonly deals = input<DealRow[]>([]);
  readonly statusOptions = input<readonly MasterDataOption[]>([]);
  readonly updatingDealId = input<string | null>(null);

  readonly stageChange = output<DealPipelineStageChange>();

  protected readonly groups = DEAL_PIPELINE_GROUPS;
  protected readonly masterOptionFormValue = masterOptionFormValue;

  protected readonly dealsByGroup = computed(() => {
    const map = new Map<string, DealRow[]>();
    for (const group of this.groups) {
      map.set(group.id, []);
    }
    for (const deal of this.deals()) {
      const group = pipelineGroupForStage(deal.status);
      const key = group?.id ?? 'proposal';
      const list = map.get(key) ?? [];
      list.push(deal);
      map.set(key, list);
    }
    return map;
  });

  protected dealTitle(row: DealRow): string {
    return row.dealTitle?.trim() || `${row.organizationName} — ${this.contactName(row)}`;
  }

  protected contactName(row: DealRow): string {
    return dealPersonName(row);
  }

  protected formatRevenue(value: number): string {
    if (!Number.isFinite(value) || value === 0) return '₹ 0';
    return `₹ ${value.toLocaleString('en-IN')}`;
  }

  protected formatFollowUp(iso?: string): string {
    if (!iso?.trim()) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(t);
    } catch {
      return new Date(t).toLocaleDateString();
    }
  }

  protected statusSelectValue(row: DealRow): string {
    const canonical = resolveDealStatusLabel(row.status);
    const opt = this.statusOptions().find((o) => o.name === canonical);
    return opt ? masterOptionFormValue(opt) : canonical;
  }

  protected onStageSelect(row: DealRow, ev: Event): void {
    const select = ev.target as HTMLSelectElement;
    const raw = select.value;
    const opt = this.statusOptions().find((o) => masterOptionFormValue(o) === raw || o.name === raw);
    const status = resolveDealStatusLabel(opt?.name ?? raw);
    if (status === resolveDealStatusLabel(row.status)) return;
    this.stageChange.emit({
      dealId: row.id,
      status,
      dealStatusId: opt?.id ?? row.dealStatusId ?? null,
    });
  }

  protected isUpdating(row: DealRow): boolean {
    return this.updatingDealId() === row.id;
  }
}

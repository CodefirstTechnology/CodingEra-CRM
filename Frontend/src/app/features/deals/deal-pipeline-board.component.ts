import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DealRow } from './deals.component';
import { resolveDealStatusLabel } from '../../core/services/deals/deal-pipeline.constants';
import { toDealPipelineRows } from '../../core/services/deals/deal-pipeline-config.util';
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

  protected readonly masterOptionFormValue = masterOptionFormValue;

  protected readonly columns = computed(() => toDealPipelineRows(this.statusOptions()));

  protected readonly dealsByColumn = computed(() => {
    const map = new Map<number, DealRow[]>();
    for (const col of this.columns()) {
      map.set(col.id, []);
    }
    for (const deal of this.deals()) {
      const opt =
        this.statusOptions().find(
          (o) =>
            o.id === deal.dealStatusId
            || o.name.toLowerCase() === deal.status.trim().toLowerCase(),
        ) ?? null;
      const key = opt?.id ?? 0;
      const list = map.get(key) ?? [];
      list.push(deal);
      if (key > 0) {
        map.set(key, list);
      } else if (this.columns().length > 0) {
        const fallback = this.columns()[0].id;
        const fbList = map.get(fallback) ?? [];
        fbList.push(deal);
        map.set(fallback, fbList);
      }
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
    const opt = this.statusOptions().find(
      (o) => o.id === row.dealStatusId || o.name.toLowerCase() === row.status.trim().toLowerCase(),
    );
    return opt ? masterOptionFormValue(opt) : row.status;
  }

  protected onStageSelect(row: DealRow, ev: Event): void {
    const select = ev.target as HTMLSelectElement;
    const raw = select.value;
    const opt = this.statusOptions().find((o) => masterOptionFormValue(o) === raw || o.name === raw);
    const status = resolveDealStatusLabel(opt?.name ?? raw);
    if (status.toLowerCase() === row.status.trim().toLowerCase()) return;
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

import type { DealPipelineStatus } from '../../../features/deals/deals.component';
import type { MasterDataOption } from '../leads/lead-master-data.service';

export const DEAL_PIPELINE_STATUSES: readonly DealPipelineStatus[] = [
  'Qualification',
  'Proposal',
  'Negotiation',
  'Demo/Making',
  'Closed Won',
  'Closed Lost',
];

/** Dropdown fallback when `/api/MasterData/deal-statuses` is unavailable. */
export const FALLBACK_DEAL_STATUS_OPTIONS: readonly MasterDataOption[] =
  DEAL_PIPELINE_STATUSES.map((name, index) => ({ id: index + 1, name }));

export function resolveDealStatusLabel(name: string): DealPipelineStatus {
  const s = name.trim();
  if (DEAL_PIPELINE_STATUSES.includes(s as DealPipelineStatus)) {
    return s as DealPipelineStatus;
  }
  const match = DEAL_PIPELINE_STATUSES.find((p) => p.toLowerCase() === s.toLowerCase());
  return match ?? 'Qualification';
}

import type { MasterDataOption } from '../leads/lead-master-data.service';

export type DealPipelineStatus =
  | 'Quotation Shared'
  | 'Follow-Up Ongoing'
  | 'Site Visit / Meeting Done'
  | 'Technical Approval'
  | 'Sample Approval'
  | 'Negotiation Stage'
  | 'PO Received'
  | 'Advance Payment Pending'
  | 'Advance Payment Received'
  | 'Production Started'
  | 'Material Ready For Dispatch'
  | 'Full Payment Pending'
  | 'Full Payment Received'
  | 'Material Dispatched'
  | 'Material Delivered'
  | 'Lead Closed - Won'
  | 'Lead Closed - Lost';

export type DealPipelineGroupId =
  | 'proposal'
  | 'technical'
  | 'order'
  | 'production'
  | 'dispatch'
  | 'closed';

export interface DealPipelineGroup {
  id: DealPipelineGroupId;
  label: string;
  stages: readonly DealPipelineStatus[];
}

export const DEAL_PIPELINE_STATUSES: readonly DealPipelineStatus[] = [
  'Quotation Shared',
  'Follow-Up Ongoing',
  'Site Visit / Meeting Done',
  'Technical Approval',
  'Sample Approval',
  'Negotiation Stage',
  'PO Received',
  'Advance Payment Pending',
  'Advance Payment Received',
  'Production Started',
  'Material Ready For Dispatch',
  'Full Payment Pending',
  'Full Payment Received',
  'Material Dispatched',
  'Material Delivered',
  'Lead Closed - Won',
  'Lead Closed - Lost',
];

export const DEAL_PIPELINE_GROUPS: readonly DealPipelineGroup[] = [
  {
    id: 'proposal',
    label: 'Proposal',
    stages: ['Quotation Shared', 'Follow-Up Ongoing', 'Site Visit / Meeting Done'],
  },
  {
    id: 'technical',
    label: 'Technical',
    stages: ['Technical Approval', 'Sample Approval', 'Negotiation Stage'],
  },
  {
    id: 'order',
    label: 'Order',
    stages: ['PO Received', 'Advance Payment Pending', 'Advance Payment Received'],
  },
  {
    id: 'production',
    label: 'Production',
    stages: ['Production Started', 'Material Ready For Dispatch'],
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    stages: [
      'Full Payment Pending',
      'Full Payment Received',
      'Material Dispatched',
      'Material Delivered',
    ],
  },
  {
    id: 'closed',
    label: 'Closed',
    stages: ['Lead Closed - Won', 'Lead Closed - Lost'],
  },
];

/** Maps legacy pipeline labels to the current canonical stage names. */
const LEGACY_STATUS_MAP: Record<string, DealPipelineStatus> = {
  Qualification: 'Quotation Shared',
  Proposal: 'Quotation Shared',
  Negotiation: 'Negotiation Stage',
  'Demo/Making': 'Technical Approval',
  'Closed Won': 'Lead Closed - Won',
  'Closed Lost': 'Lead Closed - Lost',
};

export const FALLBACK_DEAL_STATUS_OPTIONS: readonly MasterDataOption[] =
  DEAL_PIPELINE_STATUSES.map((name) => ({ id: 0, name }));

export const DEFAULT_DEAL_PIPELINE_STATUS: DealPipelineStatus = 'Quotation Shared';

export function resolveDealStatusLabel(name: string): DealPipelineStatus {
  const s = name.trim();
  if (DEAL_PIPELINE_STATUSES.includes(s as DealPipelineStatus)) {
    return s as DealPipelineStatus;
  }
  const legacy = LEGACY_STATUS_MAP[s] ?? LEGACY_STATUS_MAP[s.toLowerCase()];
  if (legacy) return legacy;
  const match = DEAL_PIPELINE_STATUSES.find((p) => p.toLowerCase() === s.toLowerCase());
  return match ?? DEFAULT_DEAL_PIPELINE_STATUS;
}

export function pipelineGroupForStage(status: string): DealPipelineGroup | null {
  const canonical = resolveDealStatusLabel(status);
  return DEAL_PIPELINE_GROUPS.find((g) => g.stages.includes(canonical)) ?? null;
}

export function isDealClosedWon(status: string): boolean {
  const s = resolveDealStatusLabel(status);
  return s === 'Lead Closed - Won';
}

export function isDealClosedLost(status: string): boolean {
  const s = resolveDealStatusLabel(status);
  return s === 'Lead Closed - Lost';
}

export function isDealClosed(status: string): boolean {
  return isDealClosedWon(status) || isDealClosedLost(status);
}

export function isDealActivePipeline(status: string): boolean {
  return !isDealClosed(status);
}

export function dealStatusCssKind(status: string): 'won' | 'lost' | 'accent' | 'demo' | 'muted' {
  const s = resolveDealStatusLabel(status);
  if (s === 'Lead Closed - Won') return 'won';
  if (s === 'Lead Closed - Lost') return 'lost';
  if (s === 'Technical Approval' || s === 'Sample Approval') return 'demo';
  if (
    s === 'Negotiation Stage' ||
    s === 'Follow-Up Ongoing' ||
    s === 'Quotation Shared' ||
    s === 'PO Received'
  ) {
    return 'accent';
  }
  return 'muted';
}

/** Resolves API `status` + `dealStatusId` from master-data options (avoids stale fallback ids). */
export function resolveDealStatusForApi(
  statusLabel: string,
  dealStatusId: number | null | undefined,
  options: readonly MasterDataOption[],
): { status: string; dealStatusId?: number } {
  const canonical = resolveDealStatusLabel(statusLabel);
  const byName = options.find(
    (o) => o.name === canonical || o.name.toLowerCase() === canonical.toLowerCase(),
  );
  if (byName && byName.id > 0) {
    return { status: byName.name, dealStatusId: byName.id };
  }
  if (dealStatusId != null && dealStatusId > 0) {
    const byId = options.find((o) => o.id === dealStatusId);
    if (byId && byId.id > 0) {
      return { status: byId.name, dealStatusId: byId.id };
    }
  }
  return { status: canonical };
}

import {
  isClosedLostStatus,
  isClosedStatus,
  isClosedWonStatus,
  resolveDealSortOrder,
  toDealPipelineRows,
  type DealPipelineStatusRow,
} from './deal-pipeline-config.util';
import {
  DEAL_STAGE_MATERIAL_DELIVERED,
  DEAL_STAGE_MILESTONE_BLOCKED_MESSAGE,
  hasReachedDealStage,
  isMilestoneBlockedTarget,
} from './deal-stage-milestones.constants';
import type { MasterDataOption } from '../leads/lead-master-data.service';

export const DEAL_STAGE_CLOSED_MESSAGE = 'Closed deals cannot be modified.';

export const DEAL_STAGE_WON_REQUIRES_MATERIAL_DELIVERED_MESSAGE =
  'Closed Won is allowed only after Material Delivered.';

export const DEAL_STAGE_LOST_REASON_REQUIRED_MESSAGE =
  'Lost reason is required when closing a deal as lost.';

export interface DealStageHistoryLike {
  newStage: string;
}

export interface DealStageValidationResult {
  allowed: boolean;
  message?: string;
}

export interface DealStageValidationInput {
  fromStatus: string;
  toStatus: string;
  stageHistory: readonly DealStageHistoryLike[];
  lostReason?: string | null;
  statusOptions: readonly MasterDataOption[];
}

function pipelineFrom(input: DealStageValidationInput): DealPipelineStatusRow[] {
  return toDealPipelineRows(input.statusOptions);
}

export function validateDealStageTransition(input: DealStageValidationInput): DealStageValidationResult {
  const pipeline = pipelineFrom(input);
  if (pipeline.length === 0) {
    return { allowed: true };
  }

  const from = input.fromStatus;
  const to = input.toStatus;

  if (isClosedStatus(pipeline, from)) {
    return { allowed: false, message: DEAL_STAGE_CLOSED_MESSAGE };
  }

  const fromOrder = resolveDealSortOrder(pipeline, from);
  const toOrder = resolveDealSortOrder(pipeline, to);
  if (fromOrder >= 0 && fromOrder === toOrder) {
    return { allowed: true };
  }

  if (isClosedLostStatus(pipeline, to)) {
    if (!input.lostReason?.trim()) {
      return { allowed: false, message: DEAL_STAGE_LOST_REASON_REQUIRED_MESSAGE };
    }
    return { allowed: true };
  }

  if (isClosedWonStatus(pipeline, to)) {
    if (!hasReachedDealStage(from, input.stageHistory, DEAL_STAGE_MATERIAL_DELIVERED)) {
      return { allowed: false, message: DEAL_STAGE_WON_REQUIRES_MATERIAL_DELIVERED_MESSAGE };
    }
    return { allowed: true };
  }

  if (
    isMilestoneBlockedTarget({
      toStatus: to,
      currentStatus: from,
      history: input.stageHistory,
      resolveSortOrder: (name) => resolveDealSortOrder(pipeline, name),
      isClosedWon: (name) => isClosedWonStatus(pipeline, name),
      isClosedLost: (name) => isClosedLostStatus(pipeline, name),
    })
  ) {
    return { allowed: false, message: DEAL_STAGE_MILESTONE_BLOCKED_MESSAGE };
  }

  return { allowed: true };
}

export function canSelectDealStage(input: Omit<DealStageValidationInput, 'lostReason'>): boolean {
  const pipeline = pipelineFrom(input as DealStageValidationInput);
  if (isClosedStatus(pipeline, input.fromStatus)) {
    return false;
  }
  if (isClosedLostStatus(pipeline, input.toStatus)) {
    return true;
  }
  return validateDealStageTransition({ ...input, lostReason: null }).allowed;
}

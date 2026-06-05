export const DEAL_STAGE_MILESTONE_BLOCKED_MESSAGE =
  'This stage cannot be selected because a later business milestone has already been completed.';

export const DEAL_STAGE_FULL_PAYMENT_RECEIVED = 'Full Payment Received';
export const DEAL_STAGE_MATERIAL_DISPATCHED = 'Material Dispatched';
export const DEAL_STAGE_MATERIAL_DELIVERED = 'Material Delivered';
export const DEAL_STAGE_PRODUCTION_STARTED = 'Production Started';
export const DEAL_STAGE_ADVANCE_PAYMENT_PENDING = 'Advance Payment Pending';
export const DEAL_STAGE_ADVANCE_PAYMENT_RECEIVED = 'Advance Payment Received';

const ADVANCE_PAYMENT_STAGE_NAMES = new Set([
  DEAL_STAGE_ADVANCE_PAYMENT_PENDING,
  DEAL_STAGE_ADVANCE_PAYMENT_RECEIVED,
]);

function nameMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function hasReachedDealStage(
  currentStatus: string,
  history: readonly { newStage: string }[],
  milestoneName: string,
): boolean {
  if (nameMatches(currentStatus, milestoneName)) {
    return true;
  }
  return history.some((h) => nameMatches(h.newStage, milestoneName));
}

export function isAdvancePaymentStageName(statusLabel: string): boolean {
  return ADVANCE_PAYMENT_STAGE_NAMES.has(statusLabel.trim());
}

export interface DealMilestoneBlockInput {
  toStatus: string;
  currentStatus: string;
  history: readonly { newStage: string }[];
  resolveSortOrder: (statusLabel: string) => number;
  isClosedWon: (statusLabel: string) => boolean;
  isClosedLost: (statusLabel: string) => boolean;
}

export function isMilestoneBlockedTarget(input: DealMilestoneBlockInput): boolean {
  const to = input.toStatus.trim();

  if (hasReachedDealStage(input.currentStatus, input.history, DEAL_STAGE_MATERIAL_DELIVERED)) {
    if (nameMatches(to, DEAL_STAGE_MATERIAL_DELIVERED)) {
      return false;
    }
    if (input.isClosedWon(to) || input.isClosedLost(to)) {
      return false;
    }
    return true;
  }

  if (hasReachedDealStage(input.currentStatus, input.history, DEAL_STAGE_MATERIAL_DISPATCHED)) {
    const productionOrder = input.resolveSortOrder(DEAL_STAGE_PRODUCTION_STARTED);
    const toOrder = input.resolveSortOrder(to);
    if (productionOrder >= 0 && toOrder >= 0 && toOrder <= productionOrder) {
      return true;
    }
  }

  if (hasReachedDealStage(input.currentStatus, input.history, DEAL_STAGE_FULL_PAYMENT_RECEIVED)) {
    if (isAdvancePaymentStageName(to)) {
      return true;
    }
  }

  return false;
}

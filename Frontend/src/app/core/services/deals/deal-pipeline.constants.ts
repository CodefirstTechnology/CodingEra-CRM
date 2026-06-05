import type { MasterDataOption } from '../leads/lead-master-data.service';
import {
  defaultDealStatusLabel,
  isClosedLostStatus,
  isClosedStatus,
  isClosedWonStatus,
  toDealPipelineRows,
} from './deal-pipeline-config.util';

/** @deprecated Use pipeline rows from API; kept for gradual migration. */
export type DealPipelineStatus = string;

export const DEFAULT_DEAL_PIPELINE_STATUS = '';

export const FALLBACK_DEAL_STATUS_OPTIONS: readonly MasterDataOption[] = [];

export function resolveDealStatusLabel(name: string): string {
  return name.trim();
}

export function isDealClosedWon(status: string, options: readonly MasterDataOption[] = []): boolean {
  const pipeline = toDealPipelineRows(options);
  if (pipeline.length > 0) return isClosedWonStatus(pipeline, status);
  return false;
}

export function isDealClosedLost(status: string, options: readonly MasterDataOption[] = []): boolean {
  const pipeline = toDealPipelineRows(options);
  if (pipeline.length > 0) return isClosedLostStatus(pipeline, status);
  return false;
}

export function isDealClosed(status: string, options: readonly MasterDataOption[] = []): boolean {
  const pipeline = toDealPipelineRows(options);
  if (pipeline.length > 0) return isClosedStatus(pipeline, status);
  return false;
}

export function isDealActivePipeline(status: string, options: readonly MasterDataOption[] = []): boolean {
  return !isDealClosed(status, options);
}

export function dealStatusCssKind(
  status: string,
  options: readonly MasterDataOption[] = [],
): 'won' | 'lost' | 'accent' | 'demo' | 'muted' {
  const pipeline = toDealPipelineRows(options);
  const row = pipeline.find((s) => s.name.toLowerCase() === status.trim().toLowerCase());
  if (row?.isWon) return 'won';
  if (row?.isLost) return 'lost';
  return 'muted';
}

export function resolveDealStatusSelectValue(
  dealStatusId: number | null | undefined,
  statusLabel: string | null | undefined,
  options: readonly MasterDataOption[],
): string {
  const label = (statusLabel ?? '').trim();

  if (options.length > 0) {
    const byName = options.find((o) => o.id > 0 && o.name.toLowerCase() === label.toLowerCase());
    if (byName) return String(byName.id);
  }

  if (dealStatusId != null && dealStatusId > 0 && options.length > 0) {
    const byId = options.find((o) => o.id === dealStatusId);
    if (byId) return String(byId.id);
  }

  if (dealStatusId != null && dealStatusId > 0) {
    return String(dealStatusId);
  }

  return label || defaultDealStatusLabel(options);
}

export interface DealDetailProgressStage {
  name: string;
  dealStatusId: number;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
}

export function buildDealDetailProgressStages(
  options: readonly MasterDataOption[],
): DealDetailProgressStage[] {
  return toDealPipelineRows(options).map((o) => ({
    name: o.name.trim(),
    dealStatusId: o.id,
    sortOrder: o.sortOrder > 0 ? o.sortOrder : o.id * 10,
    isWon: o.isWon,
    isLost: o.isLost,
  }));
}

export function dealStatusMatchesProgressStage(
  statusLabel: string,
  stage: Pick<DealDetailProgressStage, 'name'>,
): boolean {
  return statusLabel.trim().toLowerCase() === stage.name.trim().toLowerCase();
}

export function dealDetailProgressIndex(
  status: string,
  stages: readonly DealDetailProgressStage[],
): number {
  if (!stages.length) return 0;

  const directIdx = stages.findIndex((s) => dealStatusMatchesProgressStage(status, s));
  if (directIdx >= 0) return directIdx;

  const targetOrder = stages.find((s) => s.name.toLowerCase() === status.trim().toLowerCase())?.sortOrder ?? -1;
  if (targetOrder < 0) return 0;

  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].sortOrder <= targetOrder) return i;
  }
  return 0;
}

export type DealProgressStageVisualState = 'completed' | 'current' | 'pending';

export function dealProgressStageVisualState(
  stageIndex: number,
  currentIndex: number,
): DealProgressStageVisualState {
  if (stageIndex < currentIndex) return 'completed';
  if (stageIndex === currentIndex) return 'current';
  return 'pending';
}

export function resolveDealStatusForApi(
  statusLabel: string,
  dealStatusId: number | null | undefined,
  options: readonly MasterDataOption[],
): { status: string; dealStatusId?: number } {
  const label = statusLabel.trim();
  const byName = options.find((o) => o.name.toLowerCase() === label.toLowerCase());
  if (byName && byName.id > 0) {
    return { status: byName.name, dealStatusId: byName.id };
  }
  if (dealStatusId != null && dealStatusId > 0) {
    const byId = options.find((o) => o.id === dealStatusId);
    if (byId && byId.id > 0) {
      return { status: byId.name, dealStatusId: byId.id };
    }
  }
  return { status: label || defaultDealStatusLabel(options) };
}

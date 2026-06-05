import type { MasterDataOption } from '../leads/lead-master-data.service';

export interface DealPipelineStatusRow extends MasterDataOption {
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
}

export function toDealPipelineRows(options: readonly MasterDataOption[]): DealPipelineStatusRow[] {
  return options
    .filter((o) => o.id > 0 && o.name.trim())
    .map((o) => ({
      ...o,
      sortOrder: o.sortOrder ?? 0,
      isWon: o.isWon === true,
      isLost: o.isLost === true,
    }))
    .sort((a, b) => {
      const ao = a.sortOrder > 0 ? a.sortOrder : a.id * 10;
      const bo = b.sortOrder > 0 ? b.sortOrder : b.id * 10;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    });
}

function resolveRow(
  pipeline: readonly DealPipelineStatusRow[],
  statusLabel: string,
): DealPipelineStatusRow | null {
  const normalized = statusLabel.trim().toLowerCase();
  if (!normalized) return null;
  return pipeline.find((s) => s.name.trim().toLowerCase() === normalized) ?? null;
}

export function resolveDealSortOrder(
  pipeline: readonly DealPipelineStatusRow[],
  statusLabel: string,
): number {
  const row = resolveRow(pipeline, statusLabel);
  if (!row) return -1;
  return row.sortOrder > 0 ? row.sortOrder : row.id * 10;
}

export function maxReachedDealSortOrder(
  pipeline: readonly DealPipelineStatusRow[],
  currentStatus: string,
  history: readonly { newStage: string }[],
): number {
  let max = resolveDealSortOrder(pipeline, currentStatus);
  for (const h of history) {
    const order = resolveDealSortOrder(pipeline, h.newStage);
    if (order > max) max = order;
  }
  return max;
}

export function lastOpenStageSortOrder(pipeline: readonly DealPipelineStatusRow[]): number {
  const open = pipeline.filter((s) => !s.isWon && !s.isLost);
  if (open.length === 0) return -1;
  return Math.max(...open.map((s) => (s.sortOrder > 0 ? s.sortOrder : s.id * 10)));
}

export function isClosedWonStatus(
  pipeline: readonly DealPipelineStatusRow[],
  statusLabel: string,
): boolean {
  return resolveRow(pipeline, statusLabel)?.isWon === true;
}

export function isClosedLostStatus(
  pipeline: readonly DealPipelineStatusRow[],
  statusLabel: string,
): boolean {
  return resolveRow(pipeline, statusLabel)?.isLost === true;
}

export function isClosedStatus(
  pipeline: readonly DealPipelineStatusRow[],
  statusLabel: string,
): boolean {
  return isClosedWonStatus(pipeline, statusLabel) || isClosedLostStatus(pipeline, statusLabel);
}

export function defaultDealStatusLabel(options: readonly MasterDataOption[]): string {
  const rows = toDealPipelineRows(options);
  const firstOpen = rows.find((s) => !s.isWon && !s.isLost);
  return firstOpen?.name ?? rows[0]?.name ?? '';
}

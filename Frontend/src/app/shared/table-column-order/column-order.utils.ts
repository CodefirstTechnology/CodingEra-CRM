/**
 * Pure helpers for table column order: merge, reorder, storage key.
 * Visibility is intentionally out of scope — keep it independent.
 */

/** Builds `prefix` or `prefix.{userId}` for localStorage. */
export function columnOrderStorageKey(
  prefix: string,
  userId: string | null | undefined,
): string {
  const id = userId?.trim();
  return id ? `${prefix}.${id}` : prefix;
}

/**
 * Merge preferred defaults + available ids + saved/current order.
 *
 * Rules:
 * 1. Keep relative order from `savedOrCurrent` when present and non-empty.
 * 2. Otherwise start from `preferredOrder`.
 * 3. Drop unknown ids (no longer available).
 * 4. Append ids from preferred that are available but not yet placed.
 * 5. Append any remaining available ids (newly discovered columns).
 */
export function mergeColumnOrder(
  preferredOrder: readonly string[],
  availableIds: readonly string[],
  savedOrCurrent: readonly string[] | null | undefined,
): string[] {
  const available = uniquePreserveOrder(availableIds);
  const availableSet = new Set(available);
  const seen = new Set<string>();
  const out: string[] = [];

  const base =
    savedOrCurrent != null && savedOrCurrent.length > 0
      ? savedOrCurrent
      : preferredOrder;

  for (const id of base) {
    if (!availableSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  for (const id of preferredOrder) {
    if (!availableSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  for (const id of available) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

/** Move one id from `fromIndex` to `toIndex` (inclusive). Returns a new array. */
export function reorderColumnIds(
  order: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length
  ) {
    return [...order];
  }
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return next;
}

/** Sort `items` by `order` of `id`; unknown ids append in original relative order. */
export function sortByColumnOrder<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const index = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = index.has(a.id) ? index.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.id) ? index.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return 0;
  });
}

function uniquePreserveOrder(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

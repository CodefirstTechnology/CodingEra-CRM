import type { MasterDataOption } from './lead-master-data.service';

/** Set only by lead → deal conversion (not manual status pick). */
export const CONVERTED_LEAD_STATUS_NAME = 'Converted';

export function isConvertedLeadStatusName(name: string): boolean {
  return name.trim().toLowerCase() === 'converted';
}

/** False for Converted — that option is shown disabled in dropdowns. */
export function isSelectableLeadStatusOption(opt: MasterDataOption): boolean {
  return !isConvertedLeadStatusName(opt.name);
}

/** Ensures Converted appears in status dropdowns (disabled in UI). */
export function ensureConvertedInLeadStatusOptions(
  options: readonly MasterDataOption[],
): MasterDataOption[] {
  const list = [...options];
  if (!list.some((o) => isConvertedLeadStatusName(o.name))) {
    list.push({ id: 0, name: CONVERTED_LEAD_STATUS_NAME });
  }
  return list;
}

/** Canonical `lead_statuses.id` values from CRM master data. */
export const CANONICAL_LEAD_STATUS_IDS: Readonly<Record<string, number>> = {
  new: 1,
  contacted: 2,
  nurture: 3,
  unqualified: 4,
  qualified: 5,
  junk: 6,
};

/** Dropdown fallback when `/api/MasterData/lead-statuses` is unavailable. */
export const FALLBACK_LEAD_STATUS_OPTIONS: readonly MasterDataOption[] = [
  { id: 1, name: 'New' },
  { id: 2, name: 'Contacted' },
  { id: 3, name: 'Nurture' },
  { id: 4, name: 'Unqualified' },
  { id: 5, name: 'Qualified' },
  { id: 6, name: 'Junk' },
];

/** Resolves a pipeline label to `lead_statuses.id` (case-insensitive). */
export function resolveLeadStatusIdFromName(name: string): number | null {
  const key = name.trim().toLowerCase();
  if (!key) return CANONICAL_LEAD_STATUS_IDS['new'] ?? null;
  const direct = CANONICAL_LEAD_STATUS_IDS[key];
  if (direct != null) return direct;
  if (key === 'lost') return CANONICAL_LEAD_STATUS_IDS['unqualified'] ?? null;
  if (key === 'converted') return CANONICAL_LEAD_STATUS_IDS['qualified'] ?? null;
  return null;
}

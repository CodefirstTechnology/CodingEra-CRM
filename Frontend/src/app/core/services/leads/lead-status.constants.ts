import type { MasterDataOption } from './lead-master-data.service';

/**
 * Fallback display name when master data has no conversion status yet.
 * Prefer the flagged master row name at runtime (clients may rename it).
 */
export const CONVERTED_LEAD_STATUS_NAME = 'Converted';

function normalizeLeadStatusKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Legacy name aliases for the conversion status.
 * Prefer {@link isConversionLeadStatusOption} (flag) when master options are available.
 */
export function isConvertedLeadStatusName(name: string): boolean {
  const key = normalizeLeadStatusKey(name);
  // "moved to deal" kept only for rows created during the short-lived rename; flag is source of truth.
  return key === 'converted' || key === 'moved to deal';
}

/** True when this master option is the lead→deal conversion status (flag or legacy name). */
export function isConversionLeadStatusOption(opt: MasterDataOption): boolean {
  return opt.isConversionStatus === true || isConvertedLeadStatusName(opt.name);
}

/** Finds the conversion status from master options (flag first, then legacy names). */
export function findConversionLeadStatus(
  options: readonly MasterDataOption[],
): MasterDataOption | null {
  const byFlag = options.find((o) => o.isConversionStatus === true && o.id > 0);
  if (byFlag) return byFlag;
  const byName = options.find((o) => o.id > 0 && isConvertedLeadStatusName(o.name));
  return byName ?? null;
}

/** Display name for conversion status from master options. */
export function conversionLeadStatusDisplayName(
  options: readonly MasterDataOption[],
): string {
  return findConversionLeadStatus(options)?.name.trim() || CONVERTED_LEAD_STATUS_NAME;
}

/** False for the conversion status — shown disabled in dropdowns. */
export function isSelectableLeadStatusOption(opt: MasterDataOption): boolean {
  return !isConversionLeadStatusOption(opt);
}

/**
 * Ensures a conversion status appears in dropdowns (disabled in UI).
 * Does not rename client-customized conversion status names.
 */
export function ensureConvertedInLeadStatusOptions(
  options: readonly MasterDataOption[],
): MasterDataOption[] {
  const list = options.map((o) => {
    if (isConvertedLeadStatusName(o.name) && o.isConversionStatus !== true) {
      return { ...o, isConversionStatus: true };
    }
    return { ...o };
  });
  if (!list.some((o) => isConversionLeadStatusOption(o))) {
    list.push({ id: 0, name: CONVERTED_LEAD_STATUS_NAME, isConversionStatus: true });
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
  const key = normalizeLeadStatusKey(name);
  if (!key) return CANONICAL_LEAD_STATUS_IDS['new'] ?? null;
  const direct = CANONICAL_LEAD_STATUS_IDS[key];
  if (direct != null) return direct;
  if (key === 'lost') return CANONICAL_LEAD_STATUS_IDS['unqualified'] ?? null;
  if (key === 'converted' || key === 'moved to deal') return null;
  return null;
}

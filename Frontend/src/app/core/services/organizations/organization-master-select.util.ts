import type { MasterDataOption } from '../leads/lead-master-data.service';

/** Legacy labels when MasterData GET is empty or offline (matches previous static UI). */
export const ORG_INDUSTRY_FALLBACK_LABELS = [
  'Technology',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Education',
  'Other',
] as const;

export const ORG_EMPLOYEE_FALLBACK_LABELS = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;

export const ORG_TERRITORY_FALLBACK_LABELS = ['India', 'APAC', 'EMEA', 'Americas', 'Other'] as const;

export function labelsToMasterOptions(labels: readonly string[]): MasterDataOption[] {
  return labels.map((name) => ({ id: 0, name }));
}

export function mergeApiOrFallback(
  fromApi: MasterDataOption[],
  fallback: MasterDataOption[],
): MasterDataOption[] {
  return fromApi.length > 0 ? fromApi : fallback;
}

/** Value stored in &lt;select&gt; — numeric id from API, or label when using legacy `id: 0` rows. */
export function masterOptionFormValue(opt: MasterDataOption): string {
  return opt.id > 0 ? String(opt.id) : opt.name;
}

export function masterSelectControlValue(
  id: number | null | undefined,
  label: string | null | undefined,
  options: MasterDataOption[],
): string {
  if (id != null && id > 0) return String(id);
  const name = label?.trim();
  if (!name) return '';
  const norm = (s: string) => s.trim().replace(/\.$/, '').toLowerCase();
  const key = norm(name);
  const byName = options.find((o) => o.id > 0 && norm(o.name) === key);
  if (byName) return String(byName.id);
  const legacy = options.find((o) => o.id === 0 && norm(o.name) === key);
  return legacy ? legacy.name : name;
}

/** Maps form control string back to display label + optional FK for `OrganizationUpsertDto`. */
export function resolveOrgMasterPick(
  rawValue: string,
  options: MasterDataOption[],
): { label: string; masterId?: number } {
  const v = rawValue.trim();
  if (!v) return { label: '' };
  const asNum = Number(v);
  if (Number.isFinite(asNum) && asNum > 0) {
    const opt = options.find((o) => o.id === asNum);
    return { label: opt?.name ?? '', masterId: asNum };
  }
  const norm = (s: string) => s.trim().toLowerCase();
  const key = norm(v);
  const byName = options.find((o) => norm(o.name) === key);
  if (byName != null) {
    if (byName.id > 0) {
      return { label: byName.name, masterId: byName.id };
    }
    return { label: byName.name };
  }
  return { label: v };
}

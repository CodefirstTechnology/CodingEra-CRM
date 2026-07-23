import {
  formatByKind,
  formatCompanyName,
  formatIndustry,
  formatItemGroup,
  formatPersonName,
  formatRole,
  formatStatus,
  formatTerritory,
  type FormatResult,
} from './text-formatters';
import {
  entityNameCategory,
  resolveCrmEntityType,
  type CrmEntityType,
  type EntityNameCategory,
} from './entity-types';
import { normalizePayload, type FieldSchema, type NormalizePayloadOptions } from './normalize-payload';
import type { FieldKind } from './text-field-types';
import {
  collapseSpaces,
  replaceSmartQuotes,
  sanitizeBase,
  stripInjectionVectors,
  enforceMaxLength,
} from './text-sanitize';
import { FIELD_MAX_LENGTH } from './text-field-types';
import { isProtectedKey } from './text-sanitize';

/**
 * Master / catalog / product label Title Case (industry, territory, item group, etc.).
 * Not for person or company legal names.
 */
export function formatMasterName(raw: string | null | undefined): FormatResult {
  let s = sanitizeBase(raw, { preserveNewlines: false });
  s = replaceSmartQuotes(s);
  s = stripInjectionVectors(s);
  s = collapseSpaces(s);
  if (!s) return { value: '', valid: true };
  s = s
    .split(/\s+/)
    .map((w) => {
      if (!w) return w;
      const chars = [...w];
      return chars[0]!.toUpperCase() + chars.slice(1).join('').toLowerCase();
    })
    .join(' ');
  return { value: enforceMaxLength(s, FIELD_MAX_LENGTH.itemGroup), valid: true };
}

/** Resolve which formatter category applies to generic `name` for an entity. */
export function nameCategoryForEntity(
  entityType: string | CrmEntityType,
): EntityNameCategory {
  return entityNameCategory(resolveCrmEntityType(entityType));
}

/**
 * Format a generic `name` value for the given entity context.
 * Unknown entities → light global sanitize only (no Title/Person/Company case).
 */
export function formatEntityName(
  entityType: string | CrmEntityType,
  raw: string | null | undefined,
): string {
  const entity = resolveCrmEntityType(entityType);
  const category = entityNameCategory(entity);

  switch (category) {
    case 'person':
      return formatPersonName(raw).value;
    case 'company':
      return formatCompanyName(raw).value;
    case 'master':
    case 'product':
      return formatNameForMasterEntity(entity, raw);
    case 'unknown':
    default:
      return formatUnknownName(raw);
  }
}

function formatNameForMasterEntity(
  entity: CrmEntityType,
  raw: string | null | undefined,
): string {
  switch (entity) {
    case 'industry':
      return formatIndustry(raw).value;
    case 'territory':
      return formatTerritory(raw).value;
    case 'role':
      return formatRole(raw).value;
    case 'status':
    case 'leadStatus':
    case 'dealStatus':
    case 'quotationStatus':
      return formatStatus(raw).value;
    case 'itemGroup':
    case 'itemCategory':
      return formatItemGroup(raw).value;
    default:
      return formatMasterName(raw).value;
  }
}

/** Unknown entity: sanitize only — do not Title Case or invent person/company rules. */
function formatUnknownName(raw: string | null | undefined): string {
  let s = sanitizeBase(raw, { preserveNewlines: false });
  s = replaceSmartQuotes(s);
  s = stripInjectionVectors(s);
  return collapseSpaces(s);
}

/**
 * Field schema overlay so bare `name` is typed correctly for this entity.
 * Other keys still resolve via {@link CRM_FIELD_KIND_BY_KEY}.
 */
export function entityNameFieldSchema(entityType: string | CrmEntityType): FieldSchema {
  const category = nameCategoryForEntity(entityType);
  const kind: FieldKind | null =
    category === 'person'
      ? 'personName'
      : category === 'company'
        ? 'companyName'
        : category === 'master' || category === 'product'
          ? 'itemGroup'
          : null;

  if (!kind) return {};
  return { name: kind };
}

export interface NormalizeEntityOptions extends NormalizePayloadOptions {
  /** When true (default), always format `name` via entity rules even if unknown → sanitize. */
  normalizeName?: boolean;
}

/**
 * Normalize a payload for a known CRM entity.
 * Routes generic `name` through person / company / master formatters by entity type.
 */
export function normalizeEntity<T extends Record<string, unknown>>(
  entityType: string | CrmEntityType,
  payload: T,
  options?: NormalizeEntityOptions,
): T {
  const entity = resolveCrmEntityType(entityType);
  const schema: FieldSchema = {
    ...entityNameFieldSchema(entity),
    ...(options?.schema ?? {}),
  };

  // First pass: known keys (including name when mapped)
  let out = normalizePayload(payload, {
    ...options,
    schema,
    onlyKnownFields: options?.onlyKnownFields ?? true,
  });

  const normalizeName = options?.normalizeName !== false;
  if (normalizeName && 'name' in out && !isProtectedKey('name')) {
    const current = out['name'];
    if (typeof current === 'string' || current == null) {
      // Always re-apply entity-aware name (covers unknown → sanitize, and master subtypes)
      out = {
        ...out,
        name: formatEntityName(entity, current == null ? '' : String(current)),
      };
    }
  }

  return out;
}

/** Convenience: format only the name string for an entity. */
export function normalizeEntityName(
  entityType: string | CrmEntityType,
  name: string | null | undefined,
): string {
  return formatEntityName(entityType, name);
}

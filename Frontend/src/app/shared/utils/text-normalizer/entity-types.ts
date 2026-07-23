/**
 * CRM entity types for context-aware formatting of ambiguous fields (esp. `name`).
 *
 * Callers pass an entity type into {@link normalizeEntity} — never assume bare `name`
 * is a person without this context.
 */

/** Logical entity / record kinds used by the normalizer. */
export type CrmEntityType =
  // People
  | 'lead'
  | 'contact'
  | 'user'
  | 'employee'
  | 'salesUser'
  | 'leadOwner'
  | 'dealOwner'
  | 'taskAssignee'
  | 'author'
  | 'createdBy'
  | 'updatedBy'
  | 'assignedTo'
  | 'activityActor'
  | 'notificationUser'
  | 'profileUser'
  | 'crmUser'
  | 'salesRepresentative'
  // Companies / orgs
  | 'organization'
  | 'company'
  | 'customer'
  | 'brand'
  // Masters / catalog labels
  | 'itemGroup'
  | 'itemCategory'
  | 'itemAttribute'
  | 'industry'
  | 'territory'
  | 'role'
  | 'status'
  | 'leadStatus'
  | 'dealStatus'
  | 'quotationStatus'
  | 'requestType'
  | 'department'
  | 'designation'
  | 'warehouse'
  | 'product'
  | 'service'
  | 'project'
  | 'businessLine'
  | 'employeeCount'
  // Catch-all
  | 'unknown';

/** How a generic `name` (and similar) field should be formatted for an entity. */
export type EntityNameCategory = 'person' | 'company' | 'master' | 'product' | 'unknown';

export const PERSON_NAME_ENTITIES: ReadonlySet<CrmEntityType> = new Set([
  'lead',
  'contact',
  'user',
  'employee',
  'salesUser',
  'leadOwner',
  'dealOwner',
  'taskAssignee',
  'author',
  'createdBy',
  'updatedBy',
  'assignedTo',
  'activityActor',
  'notificationUser',
  'profileUser',
  'crmUser',
  'salesRepresentative',
]);

export const COMPANY_NAME_ENTITIES: ReadonlySet<CrmEntityType> = new Set([
  'organization',
  'company',
  'customer',
  'brand',
]);

/** Master / catalog label entities — Title Case via master formatter. */
export const MASTER_NAME_ENTITIES: ReadonlySet<CrmEntityType> = new Set([
  'itemGroup',
  'itemCategory',
  'itemAttribute',
  'industry',
  'territory',
  'role',
  'status',
  'leadStatus',
  'dealStatus',
  'quotationStatus',
  'requestType',
  'department',
  'designation',
  'warehouse',
  'employeeCount',
  'businessLine',
]);

/** Product / service / project display names — Title Case (same as master). */
export const PRODUCT_NAME_ENTITIES: ReadonlySet<CrmEntityType> = new Set([
  'product',
  'service',
  'project',
]);

export const ADDRESS_ENTITIES: ReadonlySet<CrmEntityType> = new Set([
  // Reserved for future address-rooted records; addresses use field keys today.
]);

/**
 * Aliases → canonical {@link CrmEntityType}.
 * Accepts UI labels, API type strings, and master-data slugs.
 */
const ENTITY_ALIASES: Record<string, CrmEntityType> = {
  lead: 'lead',
  leads: 'lead',
  contact: 'contact',
  contacts: 'contact',
  user: 'user',
  users: 'user',
  employee: 'employee',
  employees: 'employee',
  salesuser: 'salesUser',
  salesusers: 'salesUser',
  leadowner: 'leadOwner',
  dealowner: 'dealOwner',
  taskassignee: 'taskAssignee',
  assignee: 'taskAssignee',
  author: 'author',
  createdby: 'createdBy',
  updatedby: 'updatedBy',
  assignedto: 'assignedTo',
  activityactor: 'activityActor',
  actor: 'activityActor',
  notificationuser: 'notificationUser',
  profileuser: 'profileUser',
  profile: 'profileUser',
  crmuser: 'crmUser',
  salesrepresentative: 'salesRepresentative',
  salesrep: 'salesRepresentative',
  salesperson: 'salesRepresentative',

  organization: 'organization',
  organizations: 'organization',
  org: 'organization',
  company: 'company',
  companies: 'company',
  customer: 'customer',
  customers: 'customer',
  brand: 'brand',
  brands: 'brand',

  itemgroup: 'itemGroup',
  itemgroups: 'itemGroup',
  itemcategory: 'itemCategory',
  itemattribute: 'itemAttribute',
  itemattributes: 'itemAttribute',
  industry: 'industry',
  industries: 'industry',
  territory: 'territory',
  territories: 'territory',
  role: 'role',
  roles: 'role',
  status: 'status',
  statuses: 'status',
  leadstatus: 'leadStatus',
  leadstatuses: 'leadStatus',
  'lead-statuses': 'leadStatus',
  dealstatus: 'dealStatus',
  dealstatuses: 'dealStatus',
  'deal-statuses': 'dealStatus',
  quotationstatus: 'quotationStatus',
  requesttype: 'requestType',
  requesttypes: 'requestType',
  'request-types': 'requestType',
  department: 'department',
  designation: 'designation',
  warehouse: 'warehouse',
  product: 'product',
  products: 'product',
  service: 'service',
  project: 'project',
  businessline: 'businessLine',
  employeecount: 'employeeCount',
  employeecounts: 'employeeCount',
  'employee-counts': 'employeeCount',

  unknown: 'unknown',
};

/** Normalize free-form entity labels / slugs to {@link CrmEntityType}. */
export function resolveCrmEntityType(raw: string | CrmEntityType | null | undefined): CrmEntityType {
  if (raw == null || raw === '') return 'unknown';
  const s = String(raw).trim();
  if (
    PERSON_NAME_ENTITIES.has(s as CrmEntityType) ||
    COMPANY_NAME_ENTITIES.has(s as CrmEntityType) ||
    MASTER_NAME_ENTITIES.has(s as CrmEntityType) ||
    PRODUCT_NAME_ENTITIES.has(s as CrmEntityType) ||
    s === 'unknown'
  ) {
    return s as CrmEntityType;
  }

  const slug = s.toLowerCase().replace(/[_\s]+/g, '-');
  const compact = slug.replace(/-/g, '');
  return ENTITY_ALIASES[slug] ?? ENTITY_ALIASES[compact] ?? 'unknown';
}

export function entityNameCategory(entity: CrmEntityType): EntityNameCategory {
  if (PERSON_NAME_ENTITIES.has(entity)) return 'person';
  if (COMPANY_NAME_ENTITIES.has(entity)) return 'company';
  if (MASTER_NAME_ENTITIES.has(entity)) return 'master';
  if (PRODUCT_NAME_ENTITIES.has(entity)) return 'product';
  return 'unknown';
}

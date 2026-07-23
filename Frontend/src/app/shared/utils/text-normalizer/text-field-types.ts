/**
 * Field kinds for the CRM text normalization layer.
 * Map form/API property names → FieldKind via {@link CRM_FIELD_KIND_BY_KEY}.
 */

export type FieldKind =
  | 'personName'
  | 'companyName'
  | 'email'
  | 'website'
  | 'mobile'
  | 'gstin'
  | 'currency'
  | 'itemGroup'
  | 'address'
  | 'requirement'
  | 'description'
  | 'title'
  | 'territory'
  | 'industry'
  | 'status'
  | 'role'
  | 'gender'
  | 'percentage'
  | 'date'
  | 'url'
  | 'search';

/** Soft max lengths enforced after formatting (UTF-16 code units). */
export const FIELD_MAX_LENGTH: Record<FieldKind, number> = {
  personName: 100,
  companyName: 200,
  email: 254,
  website: 500,
  mobile: 20,
  gstin: 15,
  currency: 3,
  itemGroup: 100,
  address: 1000,
  requirement: 4000,
  description: 8000,
  title: 200,
  territory: 100,
  industry: 100,
  status: 80,
  role: 80,
  gender: 40,
  percentage: 20,
  date: 32,
  url: 500,
  search: 200,
};

/**
 * Canonical property / label aliases → field kind.
 * Matching is case-insensitive on the key after camelCase / snake / spaced forms.
 */
export const CRM_FIELD_KIND_BY_KEY: Record<string, FieldKind> = {
  // Person names (`name` omitted — ambiguous with company/record name)
  fullname: 'personName',
  firstname: 'personName',
  lastname: 'personName',
  contactperson: 'personName',
  // User/master ids on forms — do not format as personName (digits would be stripped).
  // Display-name variants below remain personName.
  leadownername: 'personName',
  dealownername: 'personName',
  assignedtoname: 'personName',
  username: 'personName',
  author: 'personName',
  kindattn: 'personName',
  kindattention: 'personName',
  contactname: 'personName',

  // Company
  organization: 'companyName',
  organizationname: 'companyName',
  companyname: 'companyName',
  brandname: 'companyName',
  customer: 'companyName',
  recordname: 'companyName',

  // Contact
  email: 'email',
  primaryemail: 'email',
  website: 'website',
  mobile: 'mobile',
  phone: 'mobile',
  phonenumber: 'mobile',
  mobilenumber: 'mobile',

  // Tax / money
  gst: 'gstin',
  gstin: 'gstin',
  gstnumber: 'gstin',
  currency: 'currency',
  currencycode: 'currency',

  // Catalog
  itemgroup: 'itemGroup',
  itemgroupname: 'itemGroup',

  // Address / location text
  officeaddress: 'address',
  siteaddress: 'address',
  companyaddress: 'address',
  address: 'address',
  location: 'address',

  // Free text
  requirement: 'requirement',
  requirements: 'requirement',
  description: 'description',
  notes: 'description',
  body: 'description',
  additionaldetails: 'description',
  taskdescription: 'description',
  nextstep: 'description',

  // Titles
  title: 'title',
  tasktitle: 'title',
  proposalsectiontitle: 'title',
  termtitle: 'title',
  notificationtitle: 'title',

  // Masters / enums as text
  territory: 'territory',
  industry: 'industry',
  status: 'status',
  leadstatus: 'status',
  dealstatus: 'status',
  role: 'role',
  rolename: 'role',
  gender: 'gender',

  // Percents
  gstpercent: 'percentage',
  gstpercentage: 'percentage',
  discountpercent: 'percentage',
  discountpercentage: 'percentage',
  progresspercent: 'percentage',
  progresspercentage: 'percentage',
  probabilitypercent: 'percentage',

  // Dates
  leaddate: 'date',
  date: 'date',
  duedate: 'date',
  closedate: 'date',
  startdate: 'date',
  enddate: 'date',

  // URLs
  url: 'url',
  link: 'url',

  // Search
  search: 'search',
  q: 'search',
  query: 'search',
  filter: 'search',
  searchtext: 'search',
};

/** Normalize a property name for lookup in {@link CRM_FIELD_KIND_BY_KEY}. */
export function normalizeFieldKey(key: string): string {
  return key.trim().replace(/[_\s.\-]+/g, '').toLowerCase();
}

export function resolveFieldKind(key: string): FieldKind | null {
  return CRM_FIELD_KIND_BY_KEY[normalizeFieldKey(key)] ?? null;
}

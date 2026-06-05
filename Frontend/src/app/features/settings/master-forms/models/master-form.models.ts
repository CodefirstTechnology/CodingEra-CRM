/** API slug for `GET/POST/PUT/PATCH /api/master-data/{slug}`. */
export type MasterFormEntitySlug =
  | 'salutations'
  | 'lead-statuses'
  | 'deal-statuses'
  | 'request-types'
  | 'industries'
  | 'employee-counts'
  | 'territories';

export interface MasterFormEntityConfig {
  slug: MasterFormEntitySlug;
  label: string;
  singularLabel: string;
  description: string;
}

export interface MasterFormRow {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string | null;
  sortOrder?: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface MasterFormUpsertPayload {
  id?: number;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder?: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface DealStatusReorderItem {
  id: number;
  sortOrder: number;
}

export type MasterFormSaveResult =
  | { ok: true; row: MasterFormRow }
  | { ok: false; error: string };

export const MASTER_FORM_ENTITIES: readonly MasterFormEntityConfig[] = [
  {
    slug: 'salutations',
    label: 'Salutations',
    singularLabel: 'Salutation',
    description: 'Titles such as Mr, Mrs, Ms, and Dr.',
  },
  {
    slug: 'lead-statuses',
    label: 'Lead Statuses',
    singularLabel: 'Lead Status',
    description: 'Pipeline stages for leads (New, Contacted, Qualified, etc.).',
  },
  {
    slug: 'deal-statuses',
    label: 'Deal Statuses',
    singularLabel: 'Deal Status',
    description: 'Configure deal pipeline stages, order, and Won/Lost terminal flags.',
  },
  {
    slug: 'request-types',
    label: 'Request Types',
    singularLabel: 'Request Type',
    description: 'Inbound request categories (Product Inquiry, Demo Request, etc.).',
  },
  {
    slug: 'industries',
    label: 'Industries',
    singularLabel: 'Industry',
    description: 'Industry segments for organizations and leads.',
  },
  {
    slug: 'employee-counts',
    label: 'Employee Counts',
    singularLabel: 'Employee Count',
    description: 'Company size buckets (e.g. 1–10, 11–50).',
  },
  {
    slug: 'territories',
    label: 'Territories',
    singularLabel: 'Territory',
    description: 'Sales territories and regions.',
  },
] as const;

export function masterFormEntityBySlug(slug: MasterFormEntitySlug): MasterFormEntityConfig {
  const found = MASTER_FORM_ENTITIES.find((e) => e.slug === slug);
  if (!found) {
    throw new Error(`Unknown master form entity: ${slug}`);
  }
  return found;
}

import type { ContactRow } from '../../../features/contacts/contacts.component';

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function emptyToNull(v: string | undefined | null): string | null {
  const s = (v ?? '').trim();
  return s ? s : null;
}

function formatLastModified(iso: string | undefined | null): string {
  if (iso == null || !String(iso).trim()) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Just now';
  if (diff < 86_400_000) return 'Today';
  if (diff < 172_800_000) return 'Yesterday';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(t);
  } catch {
    return new Date(t).toLocaleDateString();
  }
}

function readOrganizationId(r: Record<string, unknown>): number | null {
  const direct = readOptionalInt(r['organizationId'] ?? r['OrganizationId']);
  if (direct != null && direct > 0) return direct;
  const org = r['organization'] ?? r['Organization'];
  if (org != null && typeof org === 'object') {
    const n = readOptionalInt((org as Record<string, unknown>)['id'] ?? (org as Record<string, unknown>)['Id']);
    if (n != null && n > 0) return n;
  }
  return null;
}

function readOrganizationName(r: Record<string, unknown>): string {
  for (const key of ['organizationName', 'OrganizationName', 'companyName', 'CompanyName']) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const org = r['organization'] ?? r['Organization'];
  if (typeof org === 'string' && org.trim()) return org.trim();
  if (org != null && typeof org === 'object') {
    const o = org as Record<string, unknown>;
    const name = String(o['name'] ?? o['Name'] ?? '').trim();
    if (name) return name;
  }
  return '';
}

export function extractContactRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', 'contacts', 'Contacts']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export interface ContactUpsertDto {
  id?: number;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  organizationId?: number | null;
  designation?: string | null;
  address?: string | null;
}

/** Maps UI / form state to `POST|PUT /api/contacts` body (`ContactUpsertDto`). */
export function contactRowToUpsertDto(data: Omit<ContactRow, 'id'>, id?: number): ContactUpsertDto {
  const organizationId = data.organizationId ? readOptionalInt(data.organizationId) : null;

  return {
    id,
    salutation: emptyToNull(data.salutation),
    firstName: data.firstName?.trim() || null,
    lastName: data.lastName?.trim() || null,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    gender: emptyToNull(data.gender),
    organizationId,
    designation: emptyToNull(data.designation),
    address: emptyToNull(data.address),
  };
}

/** Maps `GET /api/contacts` records to {@link ContactRow}. */
export function mapContactApiRecord(raw: unknown): ContactRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = String(readOptionalInt(r['id']) ?? r['id'] ?? '');
  const organizationId = readOrganizationId(r);
  const organization = readOrganizationName(r);
  const phone = String(r['phone'] ?? r['Phone'] ?? r['mobile'] ?? r['Mobile'] ?? '').trim() || '—';

  return {
    id,
    salutation: String(r['salutation'] ?? r['Salutation'] ?? '').trim(),
    firstName: String(r['firstName'] ?? r['FirstName'] ?? '').trim(),
    lastName: String(r['lastName'] ?? r['LastName'] ?? '').trim(),
    email: String(r['email'] ?? r['Email'] ?? '').trim(),
    phone,
    gender: String(r['gender'] ?? r['Gender'] ?? '').trim(),
    organization: organization || '—',
    organizationId:
      organizationId != null && organizationId > 0 ? String(organizationId) : undefined,
    designation: String(r['designation'] ?? r['Designation'] ?? '').trim(),
    address: String(r['address'] ?? r['Address'] ?? '').trim(),
    lastModified: formatLastModified(
      String(r['lastModified'] ?? r['updatedAt'] ?? r['modifiedAt'] ?? r['createdAt'] ?? ''),
    ),
  };
}

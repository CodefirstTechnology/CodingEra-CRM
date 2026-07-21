import { GSTIN_PATTERN, normalizeGstin } from '../gstin.util';
import { FIELD_MAX_LENGTH, type FieldKind } from './text-field-types';
import {
  collapseDuplicatePunctuation,
  collapseSpaces,
  collapseSpacesPreserveParagraphs,
  enforceMaxLength,
  replaceSmartQuotes,
  sanitizeBase,
  stripInjectionVectors,
} from './text-sanitize';

export interface FormatResult<T = string> {
  value: T;
  valid: boolean;
  error?: string;
}

/** Legal / company suffixes — Title Case except LLP/LLC (all caps). */
const COMPANY_SUFFIX: Record<string, string> = {
  pvt: 'Pvt',
  'pvt.': 'Pvt',
  ltd: 'Ltd',
  'ltd.': 'Ltd',
  llp: 'LLP',
  'llp.': 'LLP',
  inc: 'Inc',
  'inc.': 'Inc',
  llc: 'LLC',
  'llc.': 'LLC',
  co: 'Co',
  'co.': 'Co',
  corp: 'Corp',
  'corp.': 'Corp',
  plc: 'Plc',
  gmbh: 'GmbH',
  pty: 'Pty',
};

const SUPPORTED_CURRENCIES = new Set(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY']);

const GENDER_CANON: Record<string, string> = {
  male: 'Male',
  m: 'Male',
  female: 'Female',
  f: 'Female',
  other: 'Other',
  o: 'Other',
  'prefer not to say': 'Prefer not to say',
  prefernottosay: 'Prefer not to say',
  unknown: 'Other',
};

const ROLE_CANON: Record<string, string> = {
  admin: 'Admin',
  administrator: 'Admin',
  user: 'User',
  sales: 'Sales',
  'sales manager': 'Sales Manager',
  salesmanager: 'Sales Manager',
  manager: 'Manager',
  viewer: 'Viewer',
  owner: 'Owner',
};

const STATUS_CANON: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
  'closed won': 'Closed Won',
  closedwon: 'Closed Won',
  'closed lost': 'Closed Lost',
  closedlost: 'Closed Lost',
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
  qualified: 'Qualified',
  unqualified: 'Unqualified',
  new: 'New',
  contacted: 'Contacted',
  negotiation: 'Negotiation',
  proposal: 'Proposal',
  backlog: 'Backlog',
  todo: 'Todo',
  'in progress': 'In Progress',
  inprogress: 'In Progress',
  done: 'Done',
  canceled: 'Canceled',
};

/** Honorifics / prefixes for person names (lookup key = lowercased, no spaces). */
const HONORIFICS: Record<string, string> = {
  mr: 'Mr.',
  'mr.': 'Mr.',
  mrs: 'Mrs.',
  'mrs.': 'Mrs.',
  ms: 'Ms.',
  'ms.': 'Ms.',
  miss: 'Miss',
  dr: 'Dr.',
  'dr.': 'Dr.',
  prof: 'Prof.',
  'prof.': 'Prof.',
  shri: 'Shri',
  'shri.': 'Shri',
  smt: 'Smt.',
  'smt.': 'Smt.',
  er: 'Er.',
  'er.': 'Er.',
  adv: 'Adv.',
  'adv.': 'Adv.',
  ca: 'CA',
  'ca.': 'CA',
};

function prepareSingleLine(raw: string | null | undefined): string {
  let s = sanitizeBase(raw, { preserveNewlines: false });
  s = replaceSmartQuotes(s);
  s = stripInjectionVectors(s);
  return collapseSpaces(s);
}

function prepareMultiline(raw: string | null | undefined): string {
  let s = sanitizeBase(raw, { preserveNewlines: true });
  s = replaceSmartQuotes(s);
  s = stripInjectionVectors(s);
  return collapseSpacesPreserveParagraphs(s);
}

function hasMixedCase(word: string): boolean {
  return /[a-z\u00DF-\u00F6\u00F8-\u00FF]/.test(word) && /[A-Z\u00C0-\u00D6\u00D8-\u00DE]/.test(word);
}

function titleCaseToken(word: string): string {
  if (!word) return word;
  const chars = [...word];
  const first = chars[0]!;
  return first.toUpperCase() + chars.slice(1).join('').toLowerCase();
}

function formatMcMac(word: string): string | null {
  const m = /^(ma?c)([a-z]+)$/i.exec(word);
  if (!m) return null;
  const prefix = m[1]!.toLowerCase() === 'mc' ? 'Mc' : titleCaseToken(m[1]!);
  return prefix + titleCaseToken(m[2]!);
}

function formatPersonWord(rawWord: string): string {
  let word = rawWord.replace(/^[^A-Za-z\u00C0-\u024F]+|[^A-Za-z\u00C0-\u024F.'\-]+$/g, '');
  if (!word) return '';

  const honorKey = word.toLowerCase();
  if (HONORIFICS[honorKey]) return HONORIFICS[honorKey]!;

  // Compact initials: A.P. / A.P → A.P.
  if (/^[A-Za-z](\.[A-Za-z])+\.?$/.test(word)) {
    const parts = word.replace(/\.$/, '').split('.').filter(Boolean);
    return `${parts.map((p) => p[0]!.toUpperCase()).join('.')}.`;
  }

  // Single initial letter (optionally already dotted): I / I. → I.
  if (/^[A-Za-z]\.?$/.test(word)) {
    return `${word[0]!.toUpperCase()}.`;
  }

  // Apostrophe names: O'CONNOR → O'Connor
  if (/^[A-Za-z]+'[A-Za-z]+$/.test(word)) {
    const [a, b] = word.split("'");
    return `${titleCaseToken(a!)}'${titleCaseToken(b!)}`;
  }

  // Hyphenated: ANNA-MARIA → Anna-Maria
  if (word.includes('-')) {
    return word
      .split('-')
      .map((p) => formatPersonWord(p))
      .filter(Boolean)
      .join('-');
  }

  const mc = formatMcMac(word);
  if (mc) return mc;

  return titleCaseToken(word);
}

/**
 * Person / contact display names — Title Case, honorifics, initials, commas preserved.
 */
export function formatPersonName(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  // Keep letters, spaces, periods, apostrophes, hyphens, commas, ampersands
  s = s.replace(/[^\p{L}\p{M}\s.',&\-]/gu, '');
  s = collapseSpaces(s);
  // Normalize comma spacing: "SAWANT,SHREE" / "SAWANT , SHREE" → "SAWANT, SHREE"
  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/,{2,}/g, ',');
  s = collapseDuplicatePunctuation(s);
  s = collapseSpaces(s);

  if (!s) {
    return { value: finish('personName', ''), valid: true };
  }

  // Split on spaces while keeping comma glued to previous token via ", " already normalized
  const tokens = s.split(/\s+/).filter(Boolean);
  const formatted: string[] = [];

  for (const token of tokens) {
    const hasTrailingComma = token.endsWith(',');
    const core = hasTrailingComma ? token.slice(0, -1) : token;
    if (!core) {
      if (hasTrailingComma && formatted.length) {
        formatted[formatted.length - 1] = `${formatted[formatted.length - 1]},`;
      }
      continue;
    }
    let word = formatPersonWord(core);
    if (!word) continue;
    if (hasTrailingComma) word = `${word},`;
    formatted.push(word);
  }

  s = formatted.join(' ');
  // Ensure ", " after commas
  s = s.replace(/,(?!\s|$)/g, ', ').replace(/\s+,/g, ',').replace(/,\s*/g, ', ');
  s = collapseSpaces(s);
  // Collapse duplicate initial dots: I.. → I.
  s = s.replace(/([A-Za-z])\.{2,}/g, '$1.');
  s = finish('personName', s);
  return { value: s, valid: true };
}

function formatCompanyWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (COMPANY_SUFFIX[lower]) return COMPANY_SUFFIX[lower]!;

  // Preserve brand camelCase (CodingEra)
  if (hasMixedCase(word)) return word;

  if (word.includes('-')) {
    return word.split('-').map((p) => formatCompanyWord(p)).join('-');
  }
  if (word.includes('/')) {
    return word.split('/').map((p) => formatCompanyWord(p)).join('/');
  }
  if (/^[A-Za-z]+&[A-Za-z]+$/.test(word)) {
    const [a, b] = word.split('&');
    return `${formatCompanyWord(a!)}&${formatCompanyWord(b!)}`;
  }
  return titleCaseToken(word);
}

/** Organization / brand / customer names. */
export function formatCompanyName(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  s = s.replace(/[^\p{L}\p{N}\s.'&\-\/]/gu, '');
  s = collapseSpaces(s);
  if (!s) return { value: '', valid: true };

  s = s
    .split(/\s+/)
    .map((w) => formatCompanyWord(w))
    .join(' ');
  s = finish('companyName', s);
  return { value: s, valid: true };
}

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function formatEmail(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw).replace(/\s+/g, '').toLowerCase();
  s = finish('email', s);
  if (!s) return { value: '', valid: true };
  const valid = EMAIL_RE.test(s);
  return { value: s, valid, error: valid ? undefined : 'Invalid email format' };
}

export function formatWebsite(raw: string | null | undefined): FormatResult {
  return formatUrl(raw, 'website');
}

export function formatUrl(
  raw: string | null | undefined,
  kind: 'website' | 'url' = 'url',
): FormatResult {
  let s = prepareSingleLine(raw);
  if (!s) return { value: '', valid: true };

  while (/^https?:\/\/https?:\/\//i.test(s)) {
    s = s.replace(/^(https?:\/\/)https?:\/\//i, '$1');
  }

  const hasProto = /^https?:\/\//i.test(s);
  const candidate = hasProto ? s : `https://${s}`;

  try {
    const u = new URL(candidate);
    const protocol = (u.protocol || 'https:').toLowerCase();
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    let pathname = u.pathname.replace(/\/{2,}/g, '/');
    if (pathname === '/') pathname = '';
    const out = hasProto
      ? `${protocol}//${host}${port}${pathname}${u.search}${u.hash}`
      : `${host}${port}${pathname}${u.search}${u.hash}`;
    return { value: finish(kind, out), valid: true };
  } catch {
    s = finish(kind, s.toLowerCase());
    return { value: s, valid: false, error: 'Invalid URL format' };
  }
}

export function formatMobile(raw: string | null | undefined): FormatResult {
  let s = sanitizeBase(raw, { preserveNewlines: false }).trim();
  const hadPlus = s.trimStart().startsWith('+');
  s = s.replace(/[\s().\-]/g, '');
  if (hadPlus) {
    s = '+' + s.replace(/^\+/, '').replace(/\D/g, '');
  } else {
    s = s.replace(/\D/g, '');
  }
  s = finish('mobile', s);
  if (!s) return { value: '', valid: true };

  const digits = s.replace(/\D/g, '');
  let valid = digits.length >= 8 && digits.length <= 15;
  if (s.startsWith('+')) {
    const m = /^\+(\d{1,3})(\d{4,14})$/.exec(s);
    valid = !!m && digits.length >= 8 && digits.length <= 15;
  }
  return {
    value: s,
    valid,
    error: valid ? undefined : 'Invalid mobile number',
  };
}

export function formatGstin(raw: string | null | undefined): FormatResult {
  const s = finish('gstin', normalizeGstin(raw));
  if (!s) return { value: '', valid: true };
  const valid = GSTIN_PATTERN.test(s) && s.length === 15;
  return { value: s, valid, error: valid ? undefined : 'Invalid GSTIN' };
}

export function formatCurrency(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw).replace(/\s+/g, '').toUpperCase();
  s = finish('currency', s);
  if (!s) return { value: '', valid: true };
  const valid = SUPPORTED_CURRENCIES.has(s);
  return {
    value: s,
    valid,
    error: valid
      ? undefined
      : `Unsupported currency (allowed: ${[...SUPPORTED_CURRENCIES].join(', ')})`,
  };
}

export function formatItemGroup(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  s = s
    .split(/\s+/)
    .map((w) => titleCaseToken(w))
    .join(' ');
  s = finish('itemGroup', s);
  return { value: s, valid: true };
}

export function formatAddress(raw: string | null | undefined): FormatResult {
  let s = prepareMultiline(raw);
  s = finish('address', s);
  return { value: s, valid: true };
}

export function formatRequirement(raw: string | null | undefined): FormatResult {
  let s = prepareMultiline(raw);
  s = collapseDuplicatePunctuation(s);
  const paras = s.split('\n');
  let done = false;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i]!;
    if (!p.trim()) continue;
    if (!done) {
      // Sentence case first character only — preserve technical mid-text casing
      paras[i] = p[0]!.toUpperCase() + p.slice(1);
      done = true;
    }
  }
  s = finish('requirement', paras.join('\n'));
  return { value: s, valid: true };
}

export function formatDescription(raw: string | null | undefined): FormatResult {
  let s = prepareMultiline(raw);
  s = finish('description', s);
  return { value: s, valid: true };
}

function toSentenceCase(value: string): string {
  const s = value.trim();
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower[0]!.toUpperCase() + lower.slice(1);
}

export function formatTitle(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  s = collapseDuplicatePunctuation(s);
  s = toSentenceCase(s);
  s = finish('title', s);
  return { value: s, valid: true };
}

export function formatTerritory(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  s = s
    .split(/\s+/)
    .map((w) => titleCaseToken(w))
    .join(' ');
  s = finish('territory', s);
  return { value: s, valid: true };
}

export function formatIndustry(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  s = s
    .split(/\s+/)
    .map((w) => titleCaseToken(w))
    .join(' ');
  s = finish('industry', s);
  return { value: s, valid: true };
}

export function formatStatus(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  if (!s) return { value: '', valid: true };
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  const compact = key.replace(/\s+/g, '');
  const canon = STATUS_CANON[key] ?? STATUS_CANON[compact];
  if (canon) {
    return { value: finish('status', canon), valid: true };
  }
  s = s
    .split(/\s+/)
    .map((w) => titleCaseToken(w))
    .join(' ');
  return { value: finish('status', s), valid: true };
}

export function formatRole(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  if (!s) return { value: '', valid: true };
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  const compact = key.replace(/\s+/g, '');
  const canon = ROLE_CANON[key] ?? ROLE_CANON[compact];
  if (canon) {
    return { value: finish('role', canon), valid: true };
  }
  s = s
    .split(/\s+/)
    .map((w) => titleCaseToken(w))
    .join(' ');
  return {
    value: finish('role', s),
    valid: false,
    error: 'Unsupported role',
  };
}

export function formatGender(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  if (!s) return { value: '', valid: true };
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  const compact = key.replace(/\s+/g, '');
  const canon = GENDER_CANON[key] ?? GENDER_CANON[compact];
  if (canon) {
    return { value: finish('gender', canon), valid: true };
  }
  s = s
    .split(/\s+/)
    .map((w) => titleCaseToken(w))
    .join(' ');
  return { value: finish('gender', s), valid: true };
}

export function formatPercentage(
  raw: string | number | null | undefined,
): FormatResult<number | null> {
  if (raw == null || raw === '') return { value: null, valid: true };
  if (typeof raw === 'number') {
    const n = raw;
    const valid = Number.isFinite(n) && n >= 0 && n <= 100;
    return {
      value: valid ? n : null,
      valid,
      error: valid ? undefined : 'Percentage must be 0–100',
    };
  }
  let s = prepareSingleLine(String(raw)).replace(/%/g, '').replace(/,/g, '');
  s = finish('percentage', s);
  if (!s) return { value: null, valid: true };
  const n = Number(s);
  const valid = Number.isFinite(n) && n >= 0 && n <= 100;
  return {
    value: valid ? n : null,
    valid,
    error: valid ? undefined : 'Percentage must be 0–100',
  };
}

export function formatDate(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw);
  if (!s) return { value: '', valid: true };

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const valid = isRealIsoDate(s);
    return { value: finish('date', s), valid, error: valid ? undefined : 'Invalid date' };
  }

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    const yyyy = Number(dmy[3]);
    const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const valid = isRealIsoDate(iso);
    return { value: finish('date', iso), valid, error: valid ? undefined : 'Invalid date' };
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { value: finish('date', iso), valid: isRealIsoDate(iso) };
  }

  return { value: finish('date', s), valid: false, error: 'Invalid date' };
}

function isRealIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function formatSearch(raw: string | null | undefined): FormatResult {
  let s = prepareSingleLine(raw).toLowerCase();
  s = finish('search', s);
  return { value: s, valid: true };
}

function finish(kind: FieldKind, value: string): string {
  return enforceMaxLength(value, FIELD_MAX_LENGTH[kind]);
}

export function formatByKind(kind: FieldKind, raw: unknown): FormatResult<string | number | null> {
  const asStr = raw == null ? '' : String(raw);
  switch (kind) {
    case 'personName':
      return formatPersonName(asStr);
    case 'companyName':
      return formatCompanyName(asStr);
    case 'email':
      return formatEmail(asStr);
    case 'website':
      return formatWebsite(asStr);
    case 'url':
      return formatUrl(asStr, 'url');
    case 'mobile':
      return formatMobile(asStr);
    case 'gstin':
      return formatGstin(asStr);
    case 'currency':
      return formatCurrency(asStr);
    case 'itemGroup':
      return formatItemGroup(asStr);
    case 'address':
      return formatAddress(asStr);
    case 'requirement':
      return formatRequirement(asStr);
    case 'description':
      return formatDescription(asStr);
    case 'title':
      return formatTitle(asStr);
    case 'territory':
      return formatTerritory(asStr);
    case 'industry':
      return formatIndustry(asStr);
    case 'status':
      return formatStatus(asStr);
    case 'role':
      return formatRole(asStr);
    case 'gender':
      return formatGender(asStr);
    case 'percentage':
      return formatPercentage(raw as string | number | null | undefined);
    case 'date':
      return formatDate(asStr);
    case 'search':
      return formatSearch(asStr);
    default:
      return { value: prepareSingleLine(asStr), valid: true };
  }
}

export function formatField(kind: FieldKind, raw: unknown): string {
  const r = formatByKind(kind, raw);
  if (r.value == null) return '';
  return String(r.value);
}

/**
 * Global text sanitization shared by all field formatters.
 * Never apply these helpers to passwords, tokens, API keys, or uploaded file names.
 */

const ZERO_WIDTH_RE =
  /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD]/g;

/** C0/C1 controls except tab/LF/CR (those handled per field). */
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const SMART_QUOTES: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u201F': '"',
  '\u2032': "'",
  '\u2033': '"',
};

/** Unicode NFC + strip zero-width / control chars; optionally keep newlines. */
export function sanitizeBase(
  value: string | null | undefined,
  options?: { preserveNewlines?: boolean },
): string {
  let s = String(value ?? '');
  try {
    s = s.normalize('NFC');
  } catch {
    /* ignore environments without normalize */
  }
  s = s.replace(ZERO_WIDTH_RE, '');
  if (options?.preserveNewlines) {
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(CONTROL_CHARS_RE, '');
    s = s.replace(/\t/g, ' ');
  } else {
    s = s.replace(/[\t\r\n]+/g, ' ');
    s = s.replace(CONTROL_CHARS_RE, '');
  }
  return s;
}

export function replaceSmartQuotes(value: string): string {
  return value.replace(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2032\u2033]/g, (ch) =>
    SMART_QUOTES[ch] ?? ch,
  );
}

/** Collapse runs of spaces (and optional other whitespace) to a single space. */
export function collapseSpaces(value: string): string {
  return value.replace(/ {2,}/g, ' ').trim();
}

/**
 * Collapse spaces per line; preserve paragraph breaks (blank lines collapsed to one).
 */
export function collapseSpacesPreserveParagraphs(value: string): string {
  const lines = value.split('\n').map((line) => line.replace(/ {2,}/g, ' ').trimEnd());
  const out: string[] = [];
  let blank = false;
  for (const line of lines) {
    const empty = line.trim().length === 0;
    if (empty) {
      if (!blank && out.length > 0) out.push('');
      blank = true;
    } else {
      out.push(line.trim());
      blank = false;
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n').trim();
}

/** Strip leading/trailing punctuation except letters/digits and allowed edge chars. */
export function trimEdgeSpecial(
  value: string,
  allowedEdge = /[\p{L}\p{N}'&.]/u,
): string {
  let s = value.trim();
  while (s.length && !allowedEdge.test(s[0]!)) s = s.slice(1);
  while (s.length && !allowedEdge.test(s[s.length - 1]!)) s = s.slice(0, -1);
  return s.trim();
}

/** Collapse duplicate punctuation (e.g. `!!` → `!`, `..` → `.`) but keep `...`. */
export function collapseDuplicatePunctuation(value: string): string {
  return value
    .replace(/\.{4,}/g, '...')
    .replace(/([!?])\1+/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/;{2,}/g, ';')
    .replace(/:{2,}/g, ':');
}

/**
 * Neutralize common HTML/script injection vectors in free text.
 * Does not decode entities; strips tags and javascript: / data: URL schemes in text.
 */
export function stripInjectionVectors(value: string): string {
  let s = value.replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, ' ');
  s = s.replace(/javascript\s*:/gi, '');
  s = s.replace(/data\s*:\s*text\/html/gi, '');
  s = s.replace(/on\w+\s*=/gi, '');
  return s;
}

export function enforceMaxLength(value: string, max: number): string {
  if (max <= 0 || value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}

/** Fields that must never be passed through business text formatters. */
export const NEVER_NORMALIZE_KEYS = new Set(
  [
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'idToken',
    'id_token',
    'jwt',
    'apiKey',
    'api_key',
    'secret',
    'clientSecret',
    'client_secret',
    'authorization',
    'fileName',
    'filename',
    'originalFileName',
    'uploadedFileName',
    'file',
    'binary',
    'contentBytes',
    'fileContent',
  ].map((k) => k.toLowerCase()),
);

export function isProtectedKey(key: string): boolean {
  return NEVER_NORMALIZE_KEYS.has(key.toLowerCase());
}

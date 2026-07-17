/** Fields extracted from TradeIndia inquiry template `message` blobs. */
export interface TradeIndiaInquiryParsed {
  product?: string;
  companyName?: string;
  mobile?: string;
  city?: string;
}

/** True when a value is a phone number (must not be used as lead Name). */
export function looksLikePhoneNumber(value: string | null | undefined): boolean {
  const t = String(value ?? '').trim();
  if (!t) return false;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 8) return false;
  // Allow +, spaces, dashes, parentheses — reject if letters remain after stripping those.
  return /^[+\d\s().-]+$/.test(t);
}

/** True when a value looks like an email (must not be used as lead Name). */
export function looksLikeEmailAddress(value: string | null | undefined): boolean {
  const t = String(value ?? '').trim();
  return t.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * Prefer a real person name; never fall back to mobile/email.
 * When TradeIndia omits sender_name, use company name, then "Buyer".
 */
export function resolveTradeIndiaCustomerName(options: {
  senderName?: string | null;
  companyName?: string | null;
}): string {
  const raw = String(options.senderName ?? '').trim();
  if (raw && !looksLikePhoneNumber(raw) && !looksLikeEmailAddress(raw)) {
    return raw;
  }
  const company = String(options.companyName ?? '').trim();
  if (company && company !== '-' && company !== '—') return company;
  return 'Buyer';
}

/**
 * Parses TradeIndia template messages such as:
 * "Dear …, There is an inquiry regarding products Pure Bamboo Scaffold Ladder.
 *  Below is the details of Buyer: Mobile - +91… Company Name - Acme Country - New Delhi - Delhi - IN"
 */
export function parseTradeIndiaInquiryMessage(message: string | null | undefined): TradeIndiaInquiryParsed {
  const text = String(message ?? '').trim();
  if (!text) return {};

  const product =
    text.match(/inquiry regarding products?\s+(.+?)\s*\.\s*Below/i)?.[1]?.trim() ||
    text.match(/regarding products?\s+(.+?)(?:\.|$)/i)?.[1]?.trim();

  const companyName = text.match(/Company\s*Name\s*-\s*(.+?)(?:\s+Country\s*-|$)/i)?.[1]?.trim();

  const mobileRaw = text.match(/Mobile\s*-\s*([+\d][\d\s-]*)/i)?.[1]?.trim();
  const mobile = mobileRaw ? mobileRaw.replace(/\s+/g, '') : undefined;

  const country = text.match(/Country\s*-\s*(.+)$/i)?.[1]?.trim();
  const city = country?.split(/\s*-\s*/)[0]?.trim() || undefined;

  return {
    product: product || undefined,
    companyName: companyName || undefined,
    mobile: mobile || undefined,
    city: city || undefined,
  };
}

/** Row-id helpers for marketplace leads (no integration service imports). */

export const INDIAMART_LEAD_ROW_ID_PREFIX = 'im-';
export const JUSTDIAL_LEAD_ROW_ID_PREFIX = 'jd-';
export const TRADEINDIA_LEAD_ROW_ID_PREFIX = 'ti-';

export function isIndiamartLeadRowId(id: string): boolean {
  return id.startsWith(INDIAMART_LEAD_ROW_ID_PREFIX);
}

export function isJustdialLeadRowId(id: string): boolean {
  return id.startsWith(JUSTDIAL_LEAD_ROW_ID_PREFIX);
}

export function isTradeIndiaLeadRowId(id: string): boolean {
  return id.startsWith(TRADEINDIA_LEAD_ROW_ID_PREFIX);
}

export function parseIndiamartNumericIdFromRowId(id: string): number | null {
  if (!isIndiamartLeadRowId(id)) return null;
  const n = Number(id.slice(INDIAMART_LEAD_ROW_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

export function parseJustdialNumericIdFromRowId(id: string): number | null {
  if (!isJustdialLeadRowId(id)) return null;
  const n = Number(id.slice(JUSTDIAL_LEAD_ROW_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

export function parseTradeIndiaNumericIdFromRowId(id: string): number | null {
  if (!isTradeIndiaLeadRowId(id)) return null;
  const n = Number(id.slice(TRADEINDIA_LEAD_ROW_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

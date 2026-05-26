import { plainManualLeadText, plainTextFromHtml } from '../../../shared/utils/plain-text-from-html';
import {
  extractMarketplaceExternalRef,
  parseMarketplaceNotesDisplay,
} from './marketplace-lead-to-api.mapper';

/**
 * First paragraph of manual `notes` (avoids showing duplicated blocks saved from older bugs).
 */
function firstManualNotesBlock(notes: string): string {
  const blocks = notes
    .split(/\n\s*\n/)
    .map((b) => plainManualLeadText(b))
    .filter(Boolean);
  if (blocks.length === 0) return plainManualLeadText(notes);
  return blocks[0];
}

/**
 * Builds `notes` for POST/PUT — the CRM API persists requirement text in `leads.notes`
 * (there is no separate `requirement` column on the backend).
 */
export function composeLeadNotesForApi(
  requirement: string | undefined | null,
  customField: string | undefined | null,
): string {
  const customRaw = String(customField ?? '').trim();
  /** Marketplace imports already embed inquiry text in structured `notes`. */
  if (customRaw && extractMarketplaceExternalRef(customRaw)) {
    return customRaw;
  }

  const req = plainManualLeadText(requirement);
  const custom = plainManualLeadText(customField);

  if (!req) return custom;
  if (!custom || custom === req) return req;
  if (custom.includes(req)) return custom;

  return `${req}\n\n${custom}`;
}

/**
 * Fills the UI `requirement` field when the API only returns `notes`
 * (manual leads). Marketplace rows use structured notes + {@link applyMarketplaceNotesToLeadRow}.
 */
export function resolveLeadRequirementForDisplay(
  requirement: string | undefined | null,
  notes: string | undefined | null,
): string {
  const fromCol = plainManualLeadText(requirement);
  if (fromCol) return fromCol;

  const notesRaw = String(notes ?? '').trim();
  if (!notesRaw) return '';

  if (extractMarketplaceExternalRef(notesRaw)) {
    const parsed = parseMarketplaceNotesDisplay(notesRaw);
    return plainTextFromHtml(parsed.message).trim();
  }

  return firstManualNotesBlock(notesRaw);
}

/** Extra custom-field text when `notes` contains more than the requirement line(s). */
export function resolveManualLeadCustomFieldForForm(
  requirement: string | undefined | null,
  notes: string | undefined | null,
): string {
  const req = resolveLeadRequirementForDisplay(requirement, notes);
  const notesRaw = String(notes ?? '').trim();
  if (!notesRaw || !req || extractMarketplaceExternalRef(notesRaw)) return '';

  const blocks = notesRaw
    .split(/\n\s*\n/)
    .map((b) => plainManualLeadText(b))
    .filter(Boolean);
  if (blocks.length <= 1) return '';

  const rest = blocks.slice(1).join('\n\n');
  if (rest === req) return '';
  return rest;
}

/**
 * Strips simple HTML (e.g. IndiaMART inquiry `<br>`) for table display and DB text fields.
 */
export function plainTextFromHtml(raw: string | undefined | null): string {
  if (raw == null) return '';
  let text = String(raw);
  if (!text.trim()) return '';

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>\s*/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
    .trim();
}

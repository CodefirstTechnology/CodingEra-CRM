/**
 * Structured login/session logs for debugging and audits.
 * Passwords are never logged. Emails are masked by default.
 */

export type LoginLogEvent =
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'session_restored'
  | 'session_invalid_cleared'
  | 'logout';

/** Shows first 2 chars of local part + *** + @domain (e.g. jo***@acme.com). */
export function maskEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return '***';
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const visible = Math.min(2, Math.max(1, local.length));
  return `${local.slice(0, visible)}***@${domain}`;
}

export function writeLoginLog(event: LoginLogEvent, detail: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...detail,
  };
  const line = `[CRM Login] ${JSON.stringify(entry)}`;
  if (event === 'login_failure' || event === 'session_invalid_cleared') {
    console.warn(line);
    return;
  }
  /* Hydration on every load — use Debug level so DevTools “Verbose” shows it without cluttering default Info. */
  if (event === 'session_restored') {
    console.debug(line);
    return;
  }
  console.info(line);
}

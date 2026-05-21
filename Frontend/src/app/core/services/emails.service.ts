import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { AdminUsersService, type AdminUserRow } from './admin-users.service';
import { EmailHttpService } from './emails/email-http.service';
import { prepareEmailBodyForApi } from './emails/email-api.mapper';
import type { EmailEntityType, EntityEmailItem, SendEmailDto } from './emails/email-api.models';

export interface SendEntityEmailInput {
  entityType: EmailEntityType;
  entityId: number;
  toEmail: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmailsService {
  private readonly emailHttp = inject(EmailHttpService);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);

  listForEntity(entityType: EmailEntityType, entityId: number): Observable<EntityEmailItem[]> {
    return this.withSenderResolver((resolve) =>
      this.emailHttp.list({ entityType, entityId }, resolve),
    );
  }

  sendForEntity(input: SendEntityEmailInput): Observable<EntityEmailItem> {
    const prepared = prepareEmailBodyForApi(input.body, input.isHtml ?? true);
    const payload: SendEmailDto = {
      entityType: input.entityType,
      entityId: input.entityId,
      toEmail: input.toEmail.trim(),
      subject: input.subject.trim(),
      body: prepared.body,
      isHtml: prepared.isHtml,
      sentBy: this.currentUserId(),
    };

    return this.withSenderResolver((resolve) => this.emailHttp.send(payload, resolve));
  }

  private withSenderResolver<T>(
    project: (resolve: (userId: number | null) => string) => Observable<T>,
  ): Observable<T> {
    return this.adminUsers.listUsers(this.auth.token()).pipe(
      catchError(() => of([] as AdminUserRow[])),
      switchMap((users) => {
        const resolve = (userId: number | null) => this.resolveSenderName(users, userId);
        return project(resolve);
      }),
    );
  }

  private resolveSenderName(users: AdminUserRow[], userId: number | null): string {
    if (userId == null) return 'User';

    const session = this.auth.user();
    const sessionId = session?.id?.trim();
    if (sessionId && Number(sessionId) === userId) {
      const sessionName = session?.name?.trim();
      if (sessionName) return sessionName;
    }

    const match = users.find((u) => Number(u.id) === userId);
    if (match?.name?.trim()) return match.name.trim();

    return `User #${userId}`;
  }

  private currentUserId(): number | null {
    const raw = this.auth.user()?.id?.trim();
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
}

/** User-safe message when email send fails (never expose SMTP details). */
export function emailSendErrorMessage(err: unknown): string {
  if (err != null && typeof err === 'object') {
    const e = err as { error?: unknown; message?: string };
    const body = e.error;
    if (body != null && typeof body === 'object') {
      const msg = String((body as Record<string, unknown>)['message'] ?? (body as Record<string, unknown>)['title'] ?? '').trim();
      if (msg && !/smtp|mailkit|authentication|credential/i.test(msg)) return msg;
    }
    const msg = String(e.message ?? '').trim();
    if (msg && !/smtp|mailkit|authentication|credential/i.test(msg)) return msg;
  }
  return 'Could not send email. Please try again.';
}

import { inject, Injectable, NgZone, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
  LogLevel,
} from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface UserStatusChangedEvent {
  userId: string | number;
  email?: string | null;
  isOnline: boolean;
  lastActiveAt?: string | null;
  firstLoginAt?: string | null;
}

export interface FollowUpPopupEventDto {
  taskId: number;
  leadId: number;
  leadFormattedId: string;
  customerName: string;
  contactPerson: string;
  mobile: string;
  taskTitle: string;
  dueDate: string;
  minutesOverdue: number;
  isInitialDue: boolean;
}

export interface FollowUpAdminEscalationDto {
  taskId: number;
  leadId: number;
  leadFormattedId: string;
  customerName: string;
  salesExecutiveName: string;
  salesExecutiveUserId: number;
  taskTitle: string;
  dueDate: string;
  minutesOverdue: number;
  severity: string;
  escalatedAt: string;
}

export interface DismissFollowUpPopupDto {
  taskId: number;
  leadId: number;
  reason?: string;
}

export interface DismissAdminEscalationDto {
  taskId: number;
  leadId: number;
  resolutionNotes?: string;
}

@Injectable({ providedIn: 'root' })
export class UserStatusSignalRService {
  private readonly zone = inject(NgZone);
  private readonly auth = inject(AuthService);

  private hubConnection: HubConnection | null = null;
  private readonly statusChangedSubject = new Subject<UserStatusChangedEvent>();

  /** Stream of live user status change events broadcast from the server */
  public readonly userStatusChanged$: Observable<UserStatusChangedEvent> =
    this.statusChangedSubject.asObservable();

  /** Reactive signal indicating whether the SignalR connection is currently active */
  public readonly isConnected = signal(false);

  /** Active persistent follow-up reminder popup event for current executive */
  public readonly activeFollowUpPopup = signal<FollowUpPopupEventDto | null>(null);

  /** List of active overdue follow-ups assigned specifically to current executive for User dashboard */
  public readonly userOverdueList = signal<FollowUpPopupEventDto[]>([]);

  /** List of active overdue follow-ups across all users for Admin dashboard */
  public readonly adminEscalations = signal<FollowUpAdminEscalationDto[]>([]);

  private isStarting = false;

  private resolveHubUrl(): string {
    const rawApi = (environment.apiUrl || '').trim().replace(/\/$/, '');
    const sessionUser = this.auth.user();
    const uidParam = sessionUser?.id ? `?userId=${sessionUser.id}` : '';

    if (/^https?:\/\//i.test(rawApi)) {
      return `${rawApi}/hubs/user-status${uidParam}`;
    }
    const base = rawApi || '/api';
    return `${base}/hubs/user-status${uidParam}`;
  }

  async start(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
      return;
    }

    if (this.isStarting) {
      return;
    }

    const hubUrl = this.resolveHubUrl();
    this.isStarting = true;

    try {
      if (!this.hubConnection) {
        this.hubConnection = new HubConnectionBuilder()
          .withUrl(hubUrl, {
            skipNegotiation: false,
            transport:
              HttpTransportType.WebSockets |
              HttpTransportType.ServerSentEvents |
              HttpTransportType.LongPolling,
            accessTokenFactory: () => this.auth.token() || '',
          })
          .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
          .configureLogging(LogLevel.None)
          .build();

        // 1. User Status Changed Event
        this.hubConnection.on('UserStatusChanged', (payload: UserStatusChangedEvent) => {
          this.zone.run(() => {
            this.statusChangedSubject.next(payload);
          });
        });

        // 2. Executive Persistent Follow-Up Reminder Popup Event
        this.hubConnection.on('FollowUpReminderPopup', (event: FollowUpPopupEventDto) => {
          this.zone.run(() => {
            this.activeFollowUpPopup.set(event);
            this.userOverdueList.update((list) => {
              const filtered = list.filter((e) => e.taskId !== event.taskId);
              return [event, ...filtered];
            });
          });
        });

        // 3. Dismiss Executive Follow-Up Reminder Popup Event
        this.hubConnection.on('DismissFollowUpPopup', (event: DismissFollowUpPopupDto) => {
          this.zone.run(() => {
            const current = this.activeFollowUpPopup();
            if (current && current.taskId === event.taskId) {
              this.activeFollowUpPopup.set(null);
            }
            this.userOverdueList.update((list) => list.filter((e) => e.taskId !== event.taskId));
          });
        });

        // 4. Admin SLA Breach Escalation Event
        this.hubConnection.on('FollowUpAdminEscalation', (event: FollowUpAdminEscalationDto) => {
          this.zone.run(() => {
            this.adminEscalations.update((list) => {
              const filtered = list.filter((e) => e.taskId !== event.taskId);
              return [event, ...filtered];
            });
          });
        });

        // 5. Dismiss Admin SLA Breach Escalation Event
        this.hubConnection.on('DismissAdminEscalation', (event: DismissAdminEscalationDto) => {
          this.zone.run(() => {
            this.adminEscalations.update((list) => list.filter((e) => e.taskId !== event.taskId));
          });
        });

        this.hubConnection.onreconnecting(() => {
          this.zone.run(() => {
            this.isConnected.set(false);
          });
        });

        this.hubConnection.onreconnected(() => {
          this.zone.run(() => {
            this.isConnected.set(true);
          });
        });

        this.hubConnection.onclose(() => {
          this.zone.run(() => {
            this.isConnected.set(false);
          });
        });
      }

      if (this.hubConnection.state === HubConnectionState.Disconnected) {
        await this.hubConnection.start();
        this.zone.run(() => {
          this.isConnected.set(true);
        });
      }
    } catch {
      this.zone.run(() => {
        this.isConnected.set(false);
      });
    } finally {
      this.isStarting = false;
    }
  }

  async stop(): Promise<void> {
    if (this.hubConnection) {
      try {
        await this.hubConnection.stop();
      } catch {
        // Ignored on teardown
      } finally {
        this.zone.run(() => {
          this.isConnected.set(false);
        });
      }
    }
  }

  public dismissLocalPopup(): void {
    this.zone.run(() => {
      this.activeFollowUpPopup.set(null);
    });
  }
}

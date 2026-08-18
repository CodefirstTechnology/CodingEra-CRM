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

export interface UserStatusChangedEvent {
  userId: string | number;
  isOnline: boolean;
  lastActiveAt?: string | null;
  firstLoginAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class UserStatusSignalRService {
  private readonly zone = inject(NgZone);

  private hubConnection: HubConnection | null = null;
  private readonly statusChangedSubject = new Subject<UserStatusChangedEvent>();

  /** Stream of live user status change events broadcast from the server */
  public readonly userStatusChanged$: Observable<UserStatusChangedEvent> =
    this.statusChangedSubject.asObservable();

  /** Reactive signal indicating whether the SignalR connection is currently active */
  public readonly isConnected = signal(false);

  private isStarting = false;

  /**
   * Starts or resumes the SignalR connection to `/hubs/user-status`.
   */
  async start(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
      return;
    }

    if (this.isStarting) {
      return;
    }

    const base = (environment.apiUrl || '').replace(/\/$/, '');
    if (!base) {
      return;
    }

    // Convert api base URL (e.g. http://localhost:5000/api -> http://localhost:5000/hubs/user-status)
    const hubUrl = base.endsWith('/api')
      ? `${base.slice(0, -4)}/hubs/user-status`
      : `${base}/hubs/user-status`;

    this.isStarting = true;

    try {
      if (!this.hubConnection) {
        this.hubConnection = new HubConnectionBuilder()
          .withUrl(hubUrl, {
            skipNegotiation: false,
            transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
          })
          .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
          .configureLogging(LogLevel.None)
          .build();

        this.hubConnection.on('UserStatusChanged', (payload: UserStatusChangedEvent) => {
          this.zone.run(() => {
            this.statusChangedSubject.next(payload);
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

  /**
   * Gracefully terminates the active SignalR connection.
   */
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
}

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

  private isStarting = false;

  /**
   * Resolves the SignalR hub URL dynamically at runtime based on the active environment
   * and current browser host, making it fully portable across multiple servers
   * (e.g. testing servers, staging, multiple production instances, or custom domains).
   */
  private resolveHubUrl(): string {
    const rawApi = (environment.apiUrl || '').trim().replace(/\/$/, '');

    // 1. If apiUrl is configured as an absolute URL (e.g. "https://domain.com/api" or "http://localhost:5152/api")
    if (/^https?:\/\//i.test(rawApi)) {
      return `${rawApi}/hubs/user-status`;
    }

    // 2. If relative URL (e.g. "/api" or default)
    // Connecting to a relative path dynamically binds to the active server host (window.location.origin)
    const base = rawApi || '/api';
    return `${base}/hubs/user-status`;
  }

  /**
   * Starts or resumes the SignalR connection to the dynamic user status hub.
   * Leverages multi-transport negotiation (WebSockets -> SSE -> LongPolling) with auto-reconnect.
   */
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
            // Dynamically negotiate the best supported transport for the current server environment
            transport:
              HttpTransportType.WebSockets |
              HttpTransportType.ServerSentEvents |
              HttpTransportType.LongPolling,
            accessTokenFactory: () => this.auth.token() || '',
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

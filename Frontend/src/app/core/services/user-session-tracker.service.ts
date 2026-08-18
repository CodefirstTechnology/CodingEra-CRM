import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmployeeTodayStats {
  isLoggedInToday: boolean;
  firstLoginTime: string | null;
  firstLoginTimeLabel: string;
  lastActiveTime: string | null;
  lastActiveTimeLabel: string;
  workingHoursLabel: string;
  isOnline: boolean;
  statusLabel: 'Online' | 'Offline';
}

export interface UserActivityTimestamps {
  lastActiveAt?: string | null;
  firstLoginAt?: string | null;
  isOnline?: boolean;
}

const STORAGE_KEY_PREFIX = 'crm_user_daily_sessions_v1';
const HEARTBEAT_THROTTLE_MS = 30 * 1000; // Minimum 30s between heartbeats
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // Regular 2m heartbeat interval
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes active window

export function getTodayDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTimeOnly(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }
}

export function formatRelativeTimeDiff(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

export function formatDuration(diffMs: number): string {
  if (diffMs <= 0) return '0h 0m';
  const totalMins = Math.floor(diffMs / 60000);
  if (totalMins < 1) return '< 1m';
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours}h ${mins}m`;
}

export function isUserOnline(
  userObj: UserActivityTimestamps | null | undefined,
  now = new Date(),
): boolean {
  if (!userObj) return false;
  if (userObj.isOnline === false) return false;
  if (!userObj.lastActiveAt) {
    return typeof userObj.isOnline === 'boolean' ? userObj.isOnline : false;
  }
  const d = new Date(userObj.lastActiveAt);
  if (Number.isNaN(d.getTime())) return false;
  if (getTodayDateKey(d) !== getTodayDateKey(now)) return false;
  return now.getTime() - d.getTime() <= ONLINE_THRESHOLD_MS;
}

@Injectable({ providedIn: 'root' })
export class UserSessionTrackerService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  private lastHeartbeatSent = 0;
  private heartbeatTimerId: ReturnType<typeof setInterval> | null = null;
  private routerSub: Subscription | null = null;
  private isTrackingActive = false;
  private currentUserId: string | null = null;
  private currentToken: string | null = null;

  /**
   * Starts real-time presence and activity tracking:
   * - Sends immediate heartbeat on start / login
   * - Listens to route changes (NavigationEnd) with 30s throttling
   * - Runs background heartbeat timer every 2 minutes
   * - Listens to window focus / visibility events
   */
  startTracking(userId: string | number, token: string | null): void {
    const uid = String(userId ?? '').trim();
    if (!uid || uid === '0') return;

    this.currentUserId = uid;
    this.currentToken = token;

    if (this.isTrackingActive) {
      // Re-trigger immediate heartbeat for updated session
      this.sendHeartbeat(true);
      return;
    }

    this.isTrackingActive = true;
    this.sendHeartbeat(true);

    // 1. Route change listener (NavigationEnd)
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.sendHeartbeat();
      });

    // 2. Periodic timer every 2 minutes (outside Angular zone to prevent excessive change detections)
    this.zone.runOutsideAngular(() => {
      this.heartbeatTimerId = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          this.zone.run(() => this.sendHeartbeat());
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    // 3. Tab visibility / focus listener
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onWindowInteraction);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /**
   * Stops active heartbeat tracking on user logout.
   */
  stopTracking(): void {
    this.isTrackingActive = false;
    this.currentUserId = null;
    this.currentToken = null;

    if (this.routerSub) {
      this.routerSub.unsubscribe();
      this.routerSub = null;
    }

    if (this.heartbeatTimerId != null) {
      clearInterval(this.heartbeatTimerId);
      this.heartbeatTimerId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowInteraction);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private onWindowInteraction = (): void => {
    if (this.isTrackingActive) {
      this.sendHeartbeat();
    }
  };

  private onVisibilityChange = (): void => {
    if (this.isTrackingActive && document.visibilityState === 'visible') {
      this.sendHeartbeat();
    }
  };

  /**
   * Sends a lightweight heartbeat ping to POST `/api/auth/heartbeat`.
   */
  sendHeartbeat(force = false): void {
    const uid = this.currentUserId;
    if (!uid || uid === '0') return;

    const now = Date.now();
    if (!force && now - this.lastHeartbeatSent < HEARTBEAT_THROTTLE_MS) {
      return;
    }

    this.lastHeartbeatSent = now;
    this.recordAppOpen(uid);

    const base = environment.apiUrl?.replace(/\/$/, '');
    if (!base) return;

    const numericId = Number(uid);
    if (!Number.isFinite(numericId) || numericId <= 0) return;

    const params = new HttpParams().set('userId', String(numericId));
    const headers =
      this.currentToken && this.currentToken.length > 0
        ? new HttpHeaders({ Authorization: `Bearer ${this.currentToken}` })
        : undefined;

    this.http
      .post<{
        ok: boolean;
        lastActiveAt?: string;
        firstLoginAt?: string;
        isOnline?: boolean;
      }>(`${base}/auth/heartbeat`, {}, { params, headers })
      .subscribe({
        next: (res) => {
          if (res?.ok && res.lastActiveAt) {
            this.recordSessionTimestamp(uid, res.lastActiveAt);
          }
        },
        error: () => {
          // Silently handle heartbeat error (e.g. offline/network hiccup)
        },
      });
  }

  /**
   * Records an app open / session timestamp for the active logged-in user in localStorage.
   */
  recordAppOpen(userId: string | number): void {
    const uid = String(userId).trim();
    if (!uid || uid === '0') return;
    this.recordSessionTimestamp(uid, new Date().toISOString());
  }

  private recordSessionTimestamp(uid: string, iso: string): void {
    try {
      const dateKey = getTodayDateKey();
      const storageKey = `${STORAGE_KEY_PREFIX}_${uid}_${dateKey}`;
      const raw = localStorage.getItem(storageKey);
      const timestamps: string[] = raw ? JSON.parse(raw) : [];

      const last = timestamps.length ? new Date(timestamps[timestamps.length - 1]).getTime() : 0;
      const now = new Date(iso).getTime();

      // Avoid duplicate spam within 1 minute, but record fresh interactions
      if (now - last > 60 * 1000 || timestamps.length === 0) {
        timestamps.push(iso);
        localStorage.setItem(storageKey, JSON.stringify(timestamps));
      }
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  /**
   * Retrieves recorded session timestamps for the user on a specific date.
   */
  getStoredSessions(userId: string | number, date = new Date()): string[] {
    const uid = String(userId).trim();
    if (!uid) return [];
    try {
      const dateKey = getTodayDateKey(date);
      const storageKey = `${STORAGE_KEY_PREFIX}_${uid}_${dateKey}`;
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Calculates clean, real-time today stats for an employee:
   * 1. First Login Time (e.g., "09:30 AM" or "--" if not logged in today)
   * 2. Last Active Time (e.g., "Just now", "15m ago", or actual last historical date like "5 days ago")
   * 3. Total Working Hours (duration between First Login and Last Active of today, or "0h 0m")
   * 4. Online Status (🟢 Online if active within last 10 minutes today; ⚪ Offline otherwise)
   */
  computeTodayStats(
    userId: string | number,
    allUserActivities: { createdAt?: string; timeLabel?: string }[] = [],
    userObj?: UserActivityTimestamps | null,
  ): EmployeeTodayStats {
    const uid = String(userId).trim();
    const now = new Date();
    const todayKey = getTodayDateKey(now);

    const todayDates: Date[] = [];
    const allHistoricalDates: Date[] = [];

    // 1. Process database timestamps from userObj (synced across all machines/users)
    if (userObj?.firstLoginAt) {
      const d = new Date(userObj.firstLoginAt);
      if (!Number.isNaN(d.getTime())) {
        allHistoricalDates.push(d);
        if (getTodayDateKey(d) === todayKey) {
          todayDates.push(d);
        }
      }
    }

    if (userObj?.lastActiveAt) {
      const d = new Date(userObj.lastActiveAt);
      if (!Number.isNaN(d.getTime())) {
        allHistoricalDates.push(d);
        if (getTodayDateKey(d) === todayKey) {
          todayDates.push(d);
        }
      }
    }

    // 2. Process local session storage for this specific user on today's date
    const storedToday = this.getStoredSessions(uid, now);
    for (const iso of storedToday) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        allHistoricalDates.push(d);
        if (getTodayDateKey(d) === todayKey) {
          todayDates.push(d);
        }
      }
    }

    // 3. Process activity log timestamps for this user
    for (const act of allUserActivities) {
      if (act.createdAt) {
        const d = new Date(act.createdAt);
        if (!Number.isNaN(d.getTime())) {
          allHistoricalDates.push(d);
          if (getTodayDateKey(d) === todayKey) {
            todayDates.push(d);
          }
        }
      }
    }

    // Sort all historical dates descending to find actual latest historical activity
    allHistoricalDates.sort((a, b) => b.getTime() - a.getTime());
    const latestHistorical = allHistoricalDates.length ? allHistoricalDates[0] : null;

    // IF USER HAS NO SESSIONS/ACTIVITIES TODAY:
    if (todayDates.length === 0) {
      const lastActiveLabel = latestHistorical
        ? formatRelativeTimeDiff(latestHistorical, now)
        : 'Never active';

      return {
        isLoggedInToday: false,
        firstLoginTime: null,
        firstLoginTimeLabel: '--',
        lastActiveTime: latestHistorical ? latestHistorical.toISOString() : null,
        lastActiveTimeLabel: lastActiveLabel,
        workingHoursLabel: '0h 0m',
        isOnline: false,
        statusLabel: 'Offline',
      };
    }

    // IF USER HAS LOGIN / ACTIVITY TODAY:
    todayDates.sort((a, b) => a.getTime() - b.getTime());

    const first = todayDates[0];
    const last = todayDates[todayDates.length - 1];

    const firstLoginTime = first.toISOString();
    const firstLoginTimeLabel = formatTimeOnly(first);

    const lastActiveTime = last.toISOString();
    const lastActiveTimeLabel = formatRelativeTimeDiff(last, now);

    // Working hours = duration from first login to last active today
    const durationMs = Math.max(0, last.getTime() - first.getTime());
    const workingHoursLabel = formatDuration(durationMs);

    // Online if:
    // - If userObj is provided: requires userObj.isOnline === true AND last activity is within 10 minutes today
    // - Otherwise: last activity within 10 minutes today
    const isWithin10m = now.getTime() - last.getTime() <= ONLINE_THRESHOLD_MS;
    const isOnline =
      userObj?.isOnline !== undefined ? userObj.isOnline && isWithin10m : isWithin10m;
    const statusLabel: EmployeeTodayStats['statusLabel'] = isOnline ? 'Online' : 'Offline';

    return {
      isLoggedInToday: true,
      firstLoginTime,
      firstLoginTimeLabel,
      lastActiveTime,
      lastActiveTimeLabel,
      workingHoursLabel,
      isOnline,
      statusLabel,
    };
  }
}

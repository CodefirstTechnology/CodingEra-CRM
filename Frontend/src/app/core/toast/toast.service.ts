import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  readonly type = signal<ToastType>('info');
  readonly visible = signal(false);

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  /** Shows a short-lived toast (default 3.2s). */
  show(text: string, durationMs = 3200): void {
    this.present(text, 'info', durationMs);
  }

  success(text: string, durationMs = 3200): void {
    this.present(text, 'success', durationMs);
  }

  error(text: string, durationMs = 4200): void {
    this.present(text, 'error', durationMs);
  }

  info(text: string, durationMs = 3200): void {
    this.present(text, 'info', durationMs);
  }

  private present(text: string, kind: ToastType, durationMs: number): void {
    this.clearTimers();
    this.message.set(text);
    this.type.set(kind);
    this.visible.set(true);
    this.hideTimer = window.setTimeout(() => {
      this.visible.set(false);
      this.clearTimer = window.setTimeout(() => this.message.set(null), 200);
    }, durationMs);
  }

  private clearTimers(): void {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.clearTimer != null) {
      window.clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
  }
}

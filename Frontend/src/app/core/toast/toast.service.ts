import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  readonly visible = signal(false);

  /** Shows a short-lived toast (default 3.2s). */
  show(text: string, durationMs = 3200): void {
    this.message.set(text);
    this.visible.set(true);
    window.setTimeout(() => {
      this.visible.set(false);
      window.setTimeout(() => this.message.set(null), 200);
    }, durationMs);
  }
}

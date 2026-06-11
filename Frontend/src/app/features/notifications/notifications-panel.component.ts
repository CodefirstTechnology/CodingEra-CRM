import { Component, effect, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { NotificationsPanelService } from '../../core/notifications/notifications-panel.service';

@Component({
  selector: 'app-notifications-panel',
  imports: [],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.scss',
})
export class NotificationsPanelComponent {
  protected readonly panel = inject(NotificationsPanelService);
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  constructor() {
    effect(() => {
      if (!this.panel.open()) return;
      queueMicrotask(() => this.closeBtn()?.nativeElement.focus());
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panel.open()) {
      this.panel.close({ restoreFocus: true });
    }
  }

  protected close(): void {
    this.panel.close({ restoreFocus: true });
  }

  protected onBackdropClick(): void {
    this.close();
  }

  protected markAllRead(): void {
    this.panel.markAllRead();
  }

  protected onItemClick(id: string): void {
    this.panel.markRead(id);
  }
}

import { Component, HostListener, inject } from '@angular/core';
import { NotificationsPanelService } from '../../core/notifications/notifications-panel.service';

@Component({
  selector: 'app-notifications-panel',
  imports: [],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.scss',
})
export class NotificationsPanelComponent {
  protected readonly panel = inject(NotificationsPanelService);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panel.open()) {
      this.panel.close();
    }
  }

  protected close(): void {
    this.panel.close();
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

import { computed, Injectable, signal } from '@angular/core';

export type NotificationCategory = 'deal' | 'task' | 'message' | 'system';

export interface CrmNotification {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  category: NotificationCategory;
  read: boolean;
}

const SEED: CrmNotification[] = [
  {
    id: '1',
    title: 'Deal moved to Negotiation',
    body: 'Acme Corp — Enterprise plan is now in the negotiation stage.',
    timeLabel: '12 min ago',
    category: 'deal',
    read: false,
  },
  {
    id: '2',
    title: 'Task due today',
    body: 'Follow up with Maria on the Q2 renewal proposal.',
    timeLabel: '1 hr ago',
    category: 'task',
    read: false,
  },
  {
    id: '3',
    title: 'New comment on lead',
    body: 'Alex left a note on Northwind Traders.',
    timeLabel: '3 hr ago',
    category: 'message',
    read: false,
  },
  {
    id: '4',
    title: 'Weekly digest',
    body: 'Your pipeline summary and activity highlights are ready.',
    timeLabel: 'Yesterday',
    category: 'system',
    read: true,
  },
];

@Injectable({ providedIn: 'root' })
export class NotificationsPanelService {
  readonly open = signal(false);
  private readonly items = signal<CrmNotification[]>(SEED);

  readonly notifications = this.items.asReadonly();

  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  markRead(id: string): void {
    this.items.update((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  markAllRead(): void {
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
  }
}

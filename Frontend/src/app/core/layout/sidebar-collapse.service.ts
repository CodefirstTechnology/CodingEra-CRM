import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SidebarCollapseService {
  readonly collapsed = signal(false);

  toggle(): void {
    this.collapsed.update((v) => !v);
  }

  setCollapsed(value: boolean): void {
    this.collapsed.set(value);
  }
}

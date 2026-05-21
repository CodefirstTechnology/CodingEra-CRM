import { Component, input, output, signal } from '@angular/core';
import type { ActivityGroup } from '../../../core/services/activities/activity-api.models';

@Component({
  selector: 'app-entity-activity-timeline',
  imports: [],
  templateUrl: './entity-activity-timeline.component.html',
  styleUrl: './entity-activity-timeline.component.scss',
})
export class EntityActivityTimelineComponent {
  readonly groups = input<ActivityGroup[]>([]);
  readonly loading = input(false);
  readonly emptyMessage = input('No activity yet');
  readonly ariaLabel = input('Activity timeline');

  readonly reply = output<void>();
  readonly comment = output<void>();

  protected readonly expandedGroupIds = signal<Set<string>>(new Set());

  protected toggleGroup(groupId: string): void {
    this.expandedGroupIds.update((set) => {
      const next = new Set(set);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  protected isExpanded(groupId: string): boolean {
    return this.expandedGroupIds().has(groupId);
  }
}

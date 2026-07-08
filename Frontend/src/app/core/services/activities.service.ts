import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { groupActivities } from './activities/activity-api.mapper';
import type {
  ActivityEntityType,
  ActivityGroup,
  ActivityListQuery,
  ActivityRow,
  CreateActivityBody,
} from './activities/activity-api.models';
import { ActivityHttpService } from './activities/activity-http.service';

@Injectable({ providedIn: 'root' })
export class ActivitiesService {
  private readonly activityHttp = inject(ActivityHttpService);

  list(query?: ActivityListQuery): Observable<ActivityRow[]> {
    return this.activityHttp.list(query);
  }

  listGrouped(query?: ActivityListQuery): Observable<ActivityGroup[]> {
    return this.list(query).pipe(map((rows) => groupActivities(rows)));
  }

  /**
   * Single-request recent feed for dashboards and notifications.
   * When `scope` is set, results are limited to those lead/deal ids (user-scoped views).
   */
  getRecentFeed(
    limit = 12,
    scope?: { leadIds: ReadonlySet<number>; dealIds: ReadonlySet<number> },
  ): Observable<ActivityRow[]> {
    const fetchLimit = scope ? Math.min(100, Math.max(limit, limit * 3)) : limit;
    return this.activityHttp.listRecent(fetchLimit).pipe(
      catchError(() => of([] as ActivityRow[])),
      map((rows) => {
        const sorted = [...rows].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
        if (!scope) {
          return sorted.slice(0, limit);
        }
        const filtered = sorted.filter((row) => {
          const type = String(row.entityType).toLowerCase();
          const id = Number(row.entityId);
          if (!Number.isFinite(id) || id <= 0) return false;
          if (type === 'lead') return scope.leadIds.has(id);
          if (type === 'deal') return scope.dealIds.has(id);
          return false;
        });
        return filtered.slice(0, limit);
      }),
    );
  }

  /** Per-record fetch (entity detail timelines). Prefer {@link getRecentFeed} for aggregate views. */
  getRecentForRecords(
    leadIds: readonly number[],
    dealIds: readonly number[],
    limit = 12,
  ): Observable<ActivityRow[]> {
    const requests: Observable<ActivityRow[]>[] = [
      ...leadIds
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, 20)
        .map((id) => this.getForLead(id).pipe(catchError(() => of([] as ActivityRow[])))),
      ...dealIds
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, 20)
        .map((id) => this.getForDeal(id).pipe(catchError(() => of([] as ActivityRow[])))),
    ];

    if (!requests.length) return of([]);

    return forkJoin(requests).pipe(
      map((groups) =>
        groups
          .flat()
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, limit),
      ),
    );
  }

  getForLead(leadId: number): Observable<ActivityRow[]> {
    return this.activityHttp.getForLead(leadId);
  }

  getLeadGroups(leadId: number): Observable<ActivityGroup[]> {
    return this.getForLead(leadId).pipe(map((rows) => groupActivities(rows)));
  }

  getForDeal(dealId: number): Observable<ActivityRow[]> {
    return this.activityHttp.getForDeal(dealId);
  }

  getDealGroups(dealId: number): Observable<ActivityGroup[]> {
    return this.getForDeal(dealId).pipe(map((rows) => groupActivities(rows)));
  }

  getForContact(contactId: number): Observable<ActivityRow[]> {
    return this.activityHttp.getForContact(contactId);
  }

  getContactGroups(contactId: number): Observable<ActivityGroup[]> {
    return this.getForContact(contactId).pipe(map((rows) => groupActivities(rows)));
  }

  getForOrganization(organizationId: number): Observable<ActivityGroup[]> {
    return this.activityHttp.getForOrganization(organizationId).pipe(map((rows) => groupActivities(rows)));
  }

  getForEntity(entityType: ActivityEntityType, entityId: number): Observable<ActivityGroup[]> {
    return this.activityHttp.getForEntity(entityType, entityId).pipe(map((rows) => groupActivities(rows)));
  }

  logAttachmentAdded(
    entityType: 'lead' | 'deal',
    entityId: number,
    message: string,
  ): Observable<ActivityRow> {
    const body: CreateActivityBody = {
      actionType: 'attachment_added',
      message,
    };
    return entityType === 'deal'
      ? this.activityHttp.createForDeal(entityId, body)
      : this.activityHttp.createForLead(entityId, body);
  }
}

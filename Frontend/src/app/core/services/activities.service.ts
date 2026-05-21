import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { groupActivities } from './activities/activity-api.mapper';
import type {
  ActivityEntityType,
  ActivityGroup,
  ActivityListQuery,
  ActivityRow,
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

  /** Loads and merges recent activity rows for the given lead/deal ids (newest first). */
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
}

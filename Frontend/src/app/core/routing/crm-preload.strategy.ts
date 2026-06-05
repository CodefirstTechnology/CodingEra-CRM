import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Preloads only routes marked with `data: { preload: true }`, after a short delay
 * so the first paint is not competing with background chunk downloads.
 */
@Injectable({ providedIn: 'root' })
export class CrmPreloadStrategy implements PreloadingStrategy {
  /** Milliseconds to wait after bootstrap before preloading high-traffic chunks. */
  private static readonly DELAY_MS = 2500;

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!route.data?.['preload']) {
      return of(null);
    }

    return timer(CrmPreloadStrategy.DELAY_MS).pipe(switchMap(() => load()));
  }
}

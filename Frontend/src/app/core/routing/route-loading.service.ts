import { inject, Injectable, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter } from 'rxjs/operators';

/** Tracks in-flight lazy route navigations for a lightweight shell progress indicator. */
@Injectable({ providedIn: 'root' })
export class RouteLoadingService {
  private depth = 0;

  readonly active = signal(false);

  constructor() {
    const router = inject(Router);
    router.events
      .pipe(
        filter(
          (e) =>
            e instanceof NavigationStart ||
            e instanceof NavigationEnd ||
            e instanceof NavigationCancel ||
            e instanceof NavigationError,
        ),
      )
      .subscribe((e) => {
        if (e instanceof NavigationStart) {
          if (e.navigationTrigger === 'imperative' || e.navigationTrigger === 'popstate') {
            this.depth += 1;
            this.active.set(true);
          }
          return;
        }
        this.depth = Math.max(0, this.depth - 1);
        if (this.depth === 0) {
          this.active.set(false);
        }
      });
  }
}

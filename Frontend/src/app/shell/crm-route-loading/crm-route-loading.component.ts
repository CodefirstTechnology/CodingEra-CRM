import { Component, inject } from '@angular/core';
import { RouteLoadingService } from '../../core/routing/route-loading.service';

@Component({
  selector: 'app-crm-route-loading',
  imports: [],
  template: `
    @if (loading.active()) {
      <div class="route-loading" role="status" aria-live="polite" aria-label="Loading page">
        <div class="route-loading__bar"></div>
      </div>
    }
  `,
  styles: [
    `
      .route-loading {
        position: fixed;
        inset: 0 auto auto 0;
        width: 100%;
        height: 3px;
        z-index: 1200;
        pointer-events: none;
        overflow: hidden;
        background: transparent;
      }

      .route-loading__bar {
        height: 100%;
        width: 35%;
        background: linear-gradient(90deg, transparent, var(--crm-accent, #6366f1), transparent);
        animation: route-loading-slide 1.1s ease-in-out infinite;
      }

      @keyframes route-loading-slide {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(320%);
        }
      }
    `,
  ],
})
export class CrmRouteLoadingComponent {
  protected readonly loading = inject(RouteLoadingService);
}

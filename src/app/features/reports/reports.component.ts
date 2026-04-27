import { Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  imports: [],
  template: `
    <div class="reports">
      <p class="reports__eyebrow">Reports</p>
      <h1 class="reports__title">Executive reports</h1>
      <p class="reports__text">
        Build custom reports and scheduled digests — this placeholder matches the Sales Ledger navigation.
      </p>
    </div>
  `,
  styles: `
    .reports {
      max-width: 640px;
    }
    .reports__eyebrow {
      margin: 0 0 0.35rem;
      font-size: 0.6875rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .reports__title {
      margin: 0 0 0.5rem;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .reports__text {
      margin: 0;
      color: var(--text-muted);
      line-height: 1.55;
    }
  `,
})
export class ReportsComponent {}

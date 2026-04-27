import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-simple-page',
  imports: [],
  template: `
    <div class="page">
      <h1 class="page__title">{{ title }}</h1>
      <p class="page__text">This screen is part of the Entity pages feature module (lazy-loaded).</p>
    </div>
  `,
  styles: `
    .page {
      max-width: 720px;
    }
    .page__title {
      margin: 0 0 0.5rem;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-primary);
      transition: var(--transition-theme);
    }
    .page__text {
      margin: 0;
      color: var(--text-muted);
      line-height: 1.55;
      transition: var(--transition-theme);
    }
  `,
})
export class SimplePageComponent {
  private readonly route = inject(ActivatedRoute);

  protected get title(): string {
    const self = this.route.snapshot.data['title'] as string | undefined;
    if (self) return self;
    const parent = this.route.parent?.snapshot.data['title'] as string | undefined;
    return parent ?? 'Page';
  }
}

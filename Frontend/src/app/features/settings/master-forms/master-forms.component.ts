import { Component, signal } from '@angular/core';
import { MasterFormPanelComponent } from './master-form-panel.component';
import {
  MASTER_FORM_ENTITIES,
  type MasterFormEntityConfig,
  type MasterFormEntitySlug,
} from './models/master-form.models';

@Component({
  selector: 'app-master-forms',
  imports: [MasterFormPanelComponent],
  templateUrl: './master-forms.component.html',
  styleUrl: './master-forms.component.scss',
})
export class MasterFormsComponent {
  protected readonly entities = MASTER_FORM_ENTITIES;
  protected readonly activeSlug = signal<MasterFormEntitySlug>('lead-statuses');

  protected readonly activeConfig = signal<MasterFormEntityConfig>(MASTER_FORM_ENTITIES[0]);

  protected selectEntity(slug: MasterFormEntitySlug): void {
    this.activeSlug.set(slug);
    this.activeConfig.set(
      MASTER_FORM_ENTITIES.find((e) => e.slug === slug) ?? MASTER_FORM_ENTITIES[0],
    );
  }

  protected isActive(slug: MasterFormEntitySlug): boolean {
    return this.activeSlug() === slug;
  }
}

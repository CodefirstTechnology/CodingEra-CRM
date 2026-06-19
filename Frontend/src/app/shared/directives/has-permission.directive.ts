import {
  Directive,
  effect,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { PermissionService } from '../../core/services/permission.service';

/**
 * Structural directive: `*appHasPermission="'leads.create'"` or `*appHasPermission="['users.view','settings.manage']"`.
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionService);

  readonly appHasPermission = input.required<string | readonly string[]>();

  constructor() {
    effect(() => {
      const req = this.appHasPermission();
      const codes = typeof req === 'string' ? [req] : req;
      const allowed = this.permissions.hasAny(codes);
      this.viewContainer.clear();
      if (allowed) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    });
  }
}

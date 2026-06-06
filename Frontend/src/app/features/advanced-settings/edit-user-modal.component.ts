import { Component, inject, input, output, signal, effect } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import type { AdminUserRow } from '../../core/services/admin-users.service';
import { AdminUsersService } from '../../core/services/admin-users.service';
import { RbacService } from '../../core/services/rbac.service';
import type { RoleListItem } from '../../core/auth/permission.models';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-edit-user-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './edit-user-modal.component.html',
  styleUrl: './edit-user-modal.component.scss',
})
export class EditUserModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly adminUsers = inject(AdminUsersService);
  private readonly rbac = inject(RbacService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly target = input<AdminUserRow | null>(null);
  readonly saved = output<void>();
  readonly dismiss = output<void>();

  protected readonly roles = signal<RoleListItem[]>([]);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    phone: ['', [Validators.maxLength(40)]],
    roleId: [0, [Validators.required, Validators.min(1)]],
    isActive: [true],
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const user = this.target();
      if (!user) return;
      this.form.patchValue({
        fullName: user.name,
        phone: '',
        roleId: user.roleId ?? 0,
        isActive: true,
      });
      this.rbac.listRoles(this.auth.token(), { activeOnly: true }).subscribe({
        next: (rows) => this.roles.set(rows),
        error: () => this.toast.error('Could not load roles.'),
      });
    });
  }

  protected close(): void {
    this.dismiss.emit();
  }

  protected submit(): void {
    const user = this.target();
    if (!user) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.adminUsers
      .updateUser(this.auth.token(), user.id, {
        fullName: v.fullName.trim(),
        phone: v.phone.trim() || undefined,
        roleId: v.roleId,
        isActive: v.isActive,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          if (res.ok) {
            this.toast.success('User updated.');
            this.saved.emit();
            return;
          }
          this.toast.error(res.error ?? 'Could not update user.');
        },
        error: () => {
          this.submitting.set(false);
          this.toast.error('Could not update user.');
        },
      });
  }
}

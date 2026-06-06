import { TitleCasePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  AccessScope,
  PermissionModuleGroup,
  RoleDetail,
  RoleListItem,
  RolePermissionAssignment,
} from '../../../core/auth/permission.models';
import { RbacService } from '../../../core/services/rbac.service';
import { ToastService } from '../../../core/toast/toast.service';

type PanelMode = 'list' | 'create' | 'edit' | 'permissions';

@Component({
  selector: 'app-role-management',
  imports: [ReactiveFormsModule, TitleCasePipe],
  templateUrl: './role-management.component.html',
  styleUrl: './role-management.component.scss',
})
export class RoleManagementComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly rbac = inject(RbacService);
  private readonly toast = inject(ToastService);

  protected readonly mode = signal<PanelMode>('list');
  protected readonly roles = signal<RoleListItem[]>([]);
  protected readonly permissionGroups = signal<PermissionModuleGroup[]>([]);
  protected readonly selectedRole = signal<RoleDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly searchQuery = signal('');

  protected readonly roleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    description: ['', [Validators.maxLength(500)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.reload();
  }

  protected readonly filteredRoles = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    let rows = this.roles();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    return rows;
  });

  /** permissionId -> access scope for the role being edited */
  protected readonly permissionScopes = signal<Map<number, string>>(new Map());


  protected reload(): void {
    this.loading.set(true);
    const token = this.auth.token();
    this.rbac.listRoles(token, { search: this.searchQuery() }).subscribe({
      next: (rows) => {
        this.roles.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load roles.');
      },
    });
  }

  protected onSearch(ev: Event): void {
    this.searchQuery.set((ev.target as HTMLInputElement).value);
  }

  protected openCreate(): void {
    this.roleForm.reset({ name: '', description: '', isActive: true });
    this.selectedRole.set(null);
    this.mode.set('create');
  }

  protected openEdit(role: RoleListItem): void {
    this.loading.set(true);
    this.rbac.getRole(this.auth.token(), role.id).subscribe({
      next: (detail) => {
        this.loading.set(false);
        if (!detail) {
          this.toast.error('Role not found.');
          return;
        }
        this.selectedRole.set(detail);
        this.roleForm.patchValue({
          name: detail.name,
          description: detail.description,
          isActive: detail.isActive,
        });
        this.mode.set('edit');
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load role.');
      },
    });
  }

  protected openPermissions(role: RoleListItem): void {
    this.loading.set(true);
    this.rbac.getRole(this.auth.token(), role.id).subscribe({
      next: (detail) => {
        if (!detail) {
          this.loading.set(false);
          this.toast.error('Role not found.');
          return;
        }
        this.selectedRole.set(detail);
        this.rbac.listPermissions(this.auth.token()).subscribe({
          next: (groups) => {
            this.permissionGroups.set(groups);
            const map = new Map<number, string>();
            for (const a of detail.permissions) {
              map.set(a.permissionId, String(a.accessScope));
            }
            this.permissionScopes.set(map);
            this.loading.set(false);
            this.mode.set('permissions');
          },
          error: () => {
            this.loading.set(false);
            this.toast.error('Could not load permissions.');
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load role.');
      },
    });
  }

  protected backToList(): void {
    this.mode.set('list');
    this.selectedRole.set(null);
    this.reload();
  }

  protected saveRole(): void {
    this.roleForm.markAllAsTouched();
    if (this.roleForm.invalid) return;

    const v = this.roleForm.getRawValue();
    const payload = {
      name: v.name.trim(),
      description: v.description.trim(),
      isActive: v.isActive,
    };

    this.saving.set(true);
    const token = this.auth.token();
    const selected = this.selectedRole();
    const req =
      this.mode() === 'create'
        ? this.rbac.createRole(token, payload)
        : this.rbac.updateRole(token, selected!.id, payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.mode() === 'create' ? 'Role created.' : 'Role updated.');
        this.backToList();
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not save role.');
      },
    });
  }

  protected toggleActive(role: RoleListItem): void {
    this.rbac
      .updateRole(this.auth.token(), role.id, {
        name: role.name,
        description: role.description,
        isActive: !role.isActive,
      })
      .subscribe({
        next: () => {
          this.toast.success(role.isActive ? 'Role deactivated.' : 'Role activated.');
          this.reload();
        },
        error: () => this.toast.error('Could not update role status.'),
      });
  }

  protected deleteRole(role: RoleListItem): void {
    if (role.assignedUserCount > 0) {
      this.toast.error(`Cannot delete: ${role.assignedUserCount} user(s) assigned.`);
      return;
    }
    if (!confirm(`Delete role "${role.name}"?`)) return;

    this.rbac.deleteRole(this.auth.token(), role.id).subscribe({
      next: () => {
        this.toast.success('Role deleted.');
        this.reload();
      },
      error: () => this.toast.error('Could not delete role. It may have assigned users.'),
    });
  }

  protected cloneRole(role: RoleListItem): void {
    const name = prompt('Name for cloned role:', `${role.name} Copy`);
    if (!name?.trim()) return;

    this.rbac
      .cloneRole(this.auth.token(), role.id, {
        name: name.trim(),
        description: role.description,
        isActive: true,
      })
      .subscribe({
        next: () => {
          this.toast.success('Role cloned.');
          this.reload();
        },
        error: () => this.toast.error('Could not clone role.'),
      });
  }

  protected isPermissionEnabled(permissionId: number): boolean {
    return this.permissionScopes().has(permissionId);
  }

  protected permissionScope(permissionId: number): string {
    return this.permissionScopes().get(permissionId) ?? 'own';
  }

  protected togglePermission(permissionId: number, enabled: boolean): void {
    const map = new Map(this.permissionScopes());
    if (enabled) {
      map.set(permissionId, 'own');
    } else {
      map.delete(permissionId);
    }
    this.permissionScopes.set(map);
  }

  protected setPermissionScope(permissionId: number, scope: string): void {
    const map = new Map(this.permissionScopes());
    if (map.has(permissionId)) {
      map.set(permissionId, scope);
      this.permissionScopes.set(map);
    }
  }

  protected savePermissions(): void {
    const role = this.selectedRole();
    if (!role) return;

    const assignments: RolePermissionAssignment[] = [];
    for (const [permissionId, scope] of this.permissionScopes()) {
      const def = this.permissionGroups()
        .flatMap((g) => g.permissions)
        .find((p) => p.id === permissionId);
      assignments.push({
        permissionId,
        code: def?.code ?? '',
        accessScope: scope as AccessScope,
      });
    }

    this.saving.set(true);
    this.rbac.updateRolePermissions(this.auth.token(), role.id, assignments).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Permissions saved.');
        this.backToList();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const msg =
          err && typeof err === 'object' && 'error' in err
            ? String((err as { error: unknown }).error)
            : 'Could not save permissions.';
        this.toast.error(msg.slice(0, 220) || 'Could not save permissions.');
      },
    });
  }
}

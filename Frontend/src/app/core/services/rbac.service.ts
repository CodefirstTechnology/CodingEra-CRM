import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  PermissionModuleGroup,
  RoleDetail,
  RoleListItem,
  RolePermissionAssignment,
} from '../auth/permission.models';
import { accessScopeToApi, normalizeAccessScope } from '../auth/permission.util';
import { TextFormatter } from '../../shared/utils/text-normalizer';

function apiBase(): string | null {
  const base = environment.apiUrl?.replace(/\/$/, '');
  return base || null;
}

function authHeaders(token: string | null): HttpHeaders | undefined {
  return token && token.length > 0
    ? new HttpHeaders({ Authorization: `Bearer ${token}` })
    : undefined;
}

@Injectable({ providedIn: 'root' })
export class RbacService {
  private readonly http = inject(HttpClient);

  listRoles(
    token: string | null,
    opts?: { search?: string; activeOnly?: boolean },
  ): Observable<RoleListItem[]> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next([]); s.complete(); });

    let url = `${base}/rbac/roles`;
    const params: string[] = [];
    if (opts?.search?.trim()) params.push(`search=${encodeURIComponent(opts.search.trim())}`);
    if (opts?.activeOnly) params.push('activeOnly=true');
    if (params.length) url += `?${params.join('&')}`;

    return this.http.get<unknown>(url, { headers: authHeaders(token) }).pipe(
      timeout(30000),
      map((body) => this.normalizeRoles(body)),
    );
  }

  getRole(token: string | null, roleId: number): Observable<RoleDetail | null> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next(null); s.complete(); });

    return this.http
      .get<unknown>(`${base}/rbac/roles/${roleId}`, { headers: authHeaders(token) })
      .pipe(
        timeout(30000),
        map((body) => this.normalizeRoleDetail(body)),
      );
  }

  listPermissions(token: string | null): Observable<PermissionModuleGroup[]> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next([]); s.complete(); });

    return this.http.get<unknown>(`${base}/rbac/permissions`, { headers: authHeaders(token) }).pipe(
      timeout(30000),
      map((body) => this.normalizePermissionGroups(body)),
    );
  }

  createRole(
    token: string | null,
    payload: { name: string; description: string; isActive: boolean },
  ): Observable<RoleListItem | null> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next(null); s.complete(); });

    return this.http
      .post<unknown>(`${base}/rbac/roles`, payload, { headers: authHeaders(token) })
      .pipe(timeout(15000), map((body) => this.normalizeOneRole(body)));
  }

  updateRole(
    token: string | null,
    roleId: number,
    payload: { name: string; description: string; isActive: boolean },
  ): Observable<RoleListItem | null> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next(null); s.complete(); });

    return this.http
      .put<unknown>(`${base}/rbac/roles/${roleId}`, payload, { headers: authHeaders(token) })
      .pipe(timeout(15000), map((body) => this.normalizeOneRole(body)));
  }

  updateRolePermissions(
    token: string | null,
    roleId: number,
    permissions: RolePermissionAssignment[],
  ): Observable<RoleDetail | null> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next(null); s.complete(); });

    const body = {
      permissions: permissions.map((p) => ({
        permissionId: p.permissionId,
        code: p.code,
        accessScope: accessScopeToApi(p.accessScope),
      })),
    };

    return this.http
      .put<unknown>(`${base}/rbac/roles/${roleId}/permissions`, body, {
        headers: authHeaders(token),
      })
      .pipe(timeout(30000), map((r) => this.normalizeRoleDetail(r)));
  }

  deleteRole(token: string | null, roleId: number): Observable<boolean> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next(true); s.complete(); });

    return this.http
      .delete<unknown>(`${base}/rbac/roles/${roleId}`, { headers: authHeaders(token) })
      .pipe(timeout(15000), map(() => true));
  }

  cloneRole(
    token: string | null,
    sourceRoleId: number,
    payload: { name: string; description: string; isActive: boolean },
  ): Observable<RoleDetail | null> {
    const base = apiBase();
    if (!base) return new Observable((s) => { s.next(null); s.complete(); });

    return this.http
      .post<unknown>(`${base}/rbac/roles/${sourceRoleId}/clone`, payload, {
        headers: authHeaders(token),
      })
      .pipe(timeout(30000), map((r) => this.normalizeRoleDetail(r)));
  }

  private normalizeRoles(body: unknown): RoleListItem[] {
    const arr = Array.isArray(body) ? body : [];
    return arr
      .map((r) => this.normalizeOneRole(r))
      .filter((r): r is RoleListItem => r != null);
  }

  private normalizeOneRole(raw: unknown): RoleListItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const id = Number(o['id'] ?? o['Id']);
    if (!Number.isFinite(id)) return null;
    return {
      id,
      name: TextFormatter.entityName('role', String(o['name'] ?? o['Name'] ?? '')),
      description: TextFormatter.description(String(o['description'] ?? o['Description'] ?? '')),
      isActive: Boolean(o['isActive'] ?? o['IsActive'] ?? true),
      assignedUserCount: Number(o['assignedUserCount'] ?? o['AssignedUserCount'] ?? 0),
      createdAt: o['createdAt'] != null ? String(o['createdAt']) : undefined,
    };
  }

  private normalizeRoleDetail(raw: unknown): RoleDetail | null {
    const role = this.normalizeOneRole(raw);
    if (!role || !raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const permsRaw = o['permissions'] ?? o['Permissions'];
    const permissions: RolePermissionAssignment[] = [];
    if (Array.isArray(permsRaw)) {
      for (const p of permsRaw) {
        if (!p || typeof p !== 'object') continue;
        const row = p as Record<string, unknown>;
        const permissionId = Number(row['permissionId'] ?? row['PermissionId']);
        if (!Number.isFinite(permissionId)) continue;
        permissions.push({
          permissionId,
          code: String(row['code'] ?? row['Code'] ?? ''),
          accessScope: normalizeAccessScope(row['accessScope'] ?? row['AccessScope']),
        });
      }
    }
    return { ...role, permissions };
  }

  private normalizePermissionGroups(body: unknown): PermissionModuleGroup[] {
    if (!Array.isArray(body)) return [];
    const groups: PermissionModuleGroup[] = [];
    for (const g of body) {
      if (!g || typeof g !== 'object') continue;
      const o = g as Record<string, unknown>;
      const module = String(o['module'] ?? o['Module'] ?? '');
      const permsRaw = o['permissions'] ?? o['Permissions'];
      if (!Array.isArray(permsRaw)) continue;
      const permissions = permsRaw
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const row = p as Record<string, unknown>;
          const id = Number(row['id'] ?? row['Id']);
          if (!Number.isFinite(id)) return null;
          return {
            id,
            module: String(row['module'] ?? row['Module'] ?? module),
            action: String(row['action'] ?? row['Action'] ?? ''),
            code: String(row['code'] ?? row['Code'] ?? ''),
            description: String(row['description'] ?? row['Description'] ?? ''),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      groups.push({ module, permissions });
    }
    return groups;
  }
}

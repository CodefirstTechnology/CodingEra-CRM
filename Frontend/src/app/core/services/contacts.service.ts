import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { ContactRow } from '../../features/contacts/contacts.component';
import type { OrganizationRow } from '../../features/organizations/organizations.component';
import {
  contactRowToUpsertDto,
  type ContactUpsertDto,
} from './contacts/contact-api.mapper';
import { ContactHttpService } from './contacts/contact-http.service';
import { OrganizationHttpService } from './organizations/organization-http.service';
import { OrganizationResolveService } from './organizations/organization-resolve.service';
import type { ContactImportCommitResult, ContactImportRowDto } from '../../features/contacts/import/contact-import-api.models';


@Injectable({ providedIn: 'root' })
export class ContactsService {
  private readonly contactHttp = inject(ContactHttpService);
  private readonly orgResolve = inject(OrganizationResolveService);
  private readonly orgHttp = inject(OrganizationHttpService);

  getAll(): Observable<ContactRow[]> {
    return this.enrichRows(this.contactHttp.list());
  }

  getById(id: number): Observable<ContactRow | null> {
    return this.enrichRow(this.contactHttp.getById(id));
  }

  create(data: Omit<ContactRow, 'id'>): Observable<ContactRow> {
    return this.toUpsertDto(data).pipe(
      switchMap((body) => this.contactHttp.create(body)),
      switchMap((row) =>
        this.withOrganizations((orgs) => of(this.enrichOrganization(row, orgs))),
      ),
    );
  }

  update(id: number, data: Partial<Omit<ContactRow, 'id'>>): Observable<ContactRow | null> {
    const merged = this.mergeContactRow(data);
    return this.toUpsertDto(merged, id).pipe(
      switchMap((body) => this.contactHttp.update(id, body)),
      switchMap((row) => (row != null ? this.enrichRow(of(row)) : of(null))),
    );
  }

  delete(id: number): Observable<void> {
    return this.contactHttp.delete(id);
  }

  commitImport(rows: ContactImportRowDto[]): Observable<ContactImportCommitResult> {
    return this.contactHttp.commitImport(rows);
  }

  private mergeContactRow(data: Partial<Omit<ContactRow, 'id'>>): Omit<ContactRow, 'id'> {
    return {
      salutation: data.salutation ?? '',
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      email: data.email ?? '',
      phone: data.phone ?? '—',
      gender: data.gender ?? '',
      organization: data.organization ?? '—',
      organizationId: data.organizationId,
      designation: data.designation ?? '',
      address: data.address ?? '',
      lastModified: data.lastModified ?? '—',
    };
  }

  private toUpsertDto(data: Omit<ContactRow, 'id'>, id?: number): Observable<ContactUpsertDto> {
    const orgName = data.organization?.trim();
    const existingOrgId = data.organizationId ? Number(data.organizationId) : NaN;

    if (Number.isFinite(existingOrgId) && existingOrgId > 0) {
      return of(contactRowToUpsertDto({ ...data, organizationId: String(Math.trunc(existingOrgId)) }, id));
    }

    if (!orgName || orgName === '—') {
      return of(contactRowToUpsertDto(data, id));
    }

    return this.orgResolve.ensureOrganizationId(orgName).pipe(
      map((organizationId) =>
        contactRowToUpsertDto(
          {
            ...data,
            organizationId:
              organizationId != null && organizationId > 0 ? String(organizationId) : undefined,
          },
          id,
        ),
      ),
    );
  }

  private enrichRows(source: Observable<ContactRow[]>): Observable<ContactRow[]> {
    return this.withOrganizations((orgs) =>
      source.pipe(map((rows) => rows.map((row) => this.enrichOrganization(row, orgs)))),
    );
  }

  private enrichRow(source: Observable<ContactRow | null>): Observable<ContactRow | null> {
    return this.withOrganizations((orgs) =>
      source.pipe(map((row) => (row != null ? this.enrichOrganization(row, orgs) : null))),
    );
  }

  private withOrganizations<T>(
    project: (orgs: OrganizationRow[]) => Observable<T>,
  ): Observable<T> {
    return this.orgHttp.list().pipe(
      catchError(() => of([] as OrganizationRow[])),
      switchMap((orgs) => project(orgs)),
    );
  }

  private enrichOrganization(row: ContactRow, orgs: OrganizationRow[]): ContactRow {
    const current = row.organization?.trim();
    if (current && current !== '—') return row;

    const oid = row.organizationId ? Number(row.organizationId) : NaN;
    if (!Number.isFinite(oid) || oid <= 0) return row;

    const match = orgs.find((o) => Number(o.id) === oid);
    const name = match?.name?.trim();
    return name ? { ...row, organization: name } : row;
  }
}

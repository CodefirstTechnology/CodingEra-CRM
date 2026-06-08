import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type {
  ItemAttribute,
  ItemAttributeUpsert,
  ItemDetail,
  ItemGroup,
  ItemGroupUpsert,
  ItemListItem,
  ItemListQuery,
  ItemUpsert,
  ItemVariantGenerate,
  ItemVariantUpsert,
  PagedResult,
  QuotationCatalog,
} from './item-master-api.models';
import {
  mapItemAttribute,
  mapItemDetail,
  mapItemGroup,
  mapPagedItems,
  mapQuotationCatalog,
  toItemAttributeBody,
  toItemGroupBody,
  toItemUpsertBody,
  toVariantGenerateBody,
  toVariantUpsertBody,
} from './item-master-api.mapper';

@Injectable({ providedIn: 'root' })
export class ItemMasterHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/item-master`;

  private jsonHeaders(): HttpHeaders {
    let h = new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = this.auth.token();
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  listGroups(activeOnly = false): Observable<ItemGroup[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http
      .get<unknown[]>(`${this.baseUrl}/groups`, { headers: this.jsonHeaders(), params })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapItemGroup)));
  }

  createGroup(dto: ItemGroupUpsert): Observable<ItemGroup> {
    return this.http
      .post<unknown>(`${this.baseUrl}/groups`, toItemGroupBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapItemGroup));
  }

  updateGroup(id: number, dto: ItemGroupUpsert): Observable<ItemGroup> {
    return this.http
      .put<unknown>(`${this.baseUrl}/groups/${id}`, toItemGroupBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapItemGroup));
  }

  deleteGroup(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/groups/${id}`, { headers: this.jsonHeaders() });
  }

  listAttributes(activeOnly = false): Observable<ItemAttribute[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http
      .get<unknown[]>(`${this.baseUrl}/attributes`, { headers: this.jsonHeaders(), params })
      .pipe(map((rows) => (Array.isArray(rows) ? rows : []).map(mapItemAttribute)));
  }

  createAttribute(dto: ItemAttributeUpsert): Observable<ItemAttribute> {
    return this.http
      .post<unknown>(`${this.baseUrl}/attributes`, toItemAttributeBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapItemAttribute));
  }

  updateAttribute(id: number, dto: ItemAttributeUpsert): Observable<ItemAttribute> {
    return this.http
      .put<unknown>(`${this.baseUrl}/attributes/${id}`, toItemAttributeBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapItemAttribute));
  }

  deleteAttribute(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/attributes/${id}`, { headers: this.jsonHeaders() });
  }

  getQuotationCatalog(): Observable<QuotationCatalog> {
    return this.http
      .get<unknown>(`${this.baseUrl}/quotation-catalog`, { headers: this.jsonHeaders() })
      .pipe(map(mapQuotationCatalog));
  }

  listItems(query: ItemListQuery = {}): Observable<PagedResult<ItemListItem>> {
    let params = new HttpParams();
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.itemGroupId != null && query.itemGroupId > 0) {
      params = params.set('itemGroupId', String(query.itemGroupId));
    }
    if (query.status) params = params.set('status', query.status);
    if (query.parentItemId != null && query.parentItemId > 0) {
      params = params.set('parentItemId', String(query.parentItemId));
    }
    if (query.includeVariants) params = params.set('includeVariants', 'true');
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);
    params = params.set('page', String(query.page ?? 1));
    params = params.set('pageSize', String(query.pageSize ?? 20));
    if (query.attributeFilters) {
      for (const [key, val] of Object.entries(query.attributeFilters)) {
        if (val.trim()) params = params.set(`attributeFilters[${key}]`, val.trim());
      }
    }

    return this.http
      .get<unknown>(`${this.baseUrl}/items`, { headers: this.jsonHeaders(), params })
      .pipe(map(mapPagedItems));
  }

  getItem(id: number): Observable<ItemDetail> {
    return this.http
      .get<unknown>(`${this.baseUrl}/items/${id}`, { headers: this.jsonHeaders() })
      .pipe(map(mapItemDetail));
  }

  createItem(dto: ItemUpsert): Observable<ItemDetail> {
    return this.http
      .post<unknown>(`${this.baseUrl}/items`, toItemUpsertBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapItemDetail));
  }

  updateItem(id: number, dto: ItemUpsert): Observable<ItemDetail> {
    return this.http
      .put<unknown>(`${this.baseUrl}/items/${id}`, toItemUpsertBody(dto), { headers: this.jsonHeaders() })
      .pipe(map(mapItemDetail));
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/items/${id}`, { headers: this.jsonHeaders() });
  }

  createVariant(parentId: number, dto: ItemVariantUpsert): Observable<ItemDetail> {
    return this.http
      .post<unknown>(`${this.baseUrl}/items/${parentId}/variants`, toVariantUpsertBody(dto), {
        headers: this.jsonHeaders(),
      })
      .pipe(map(mapItemDetail));
  }

  generateVariants(parentId: number, dto: ItemVariantGenerate): Observable<ItemDetail> {
    return this.http
      .post<unknown>(`${this.baseUrl}/items/${parentId}/variants/generate`, toVariantGenerateBody(dto), {
        headers: this.jsonHeaders(),
      })
      .pipe(map(mapItemDetail));
  }

  deleteVariant(parentId: number, variantId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/items/${parentId}/variants/${variantId}`, {
      headers: this.jsonHeaders(),
    });
  }
}

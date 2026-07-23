import type {
  ItemAttribute,
  ItemAttributeValue,
  ItemDetail,
  ItemGroup,
  ItemListItem,
  ItemSpecification,
  ItemVariantAttribute,
  ItemAttributeValueType,
  ItemStatus,
  PagedResult,
  QuotationCatalog,
  QuotationCatalogColumn,
  QuotationCatalogItem,
} from './item-master-api.models';
import { TextFormatter } from '../../../shared/utils/text-normalizer';

function readObj(raw: unknown): Record<string, unknown> {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function readStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

function readNum(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function readOptInt(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function readBool(o: Record<string, unknown>, keys: string[], defaultValue = false): boolean {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) {
      const v = o[k];
      if (typeof v === 'boolean') return v;
    }
  }
  return defaultValue;
}

function mapAttributeValue(raw: unknown): ItemAttributeValue {
  const o = readObj(raw);
  return {
    id: readNum(o, ['id', 'Id']),
    attributeId: readNum(o, ['attributeId', 'AttributeId']),
    value: readStr(o, ['value', 'Value']),
    sortOrder: readNum(o, ['sortOrder', 'SortOrder']),
    isActive: readBool(o, ['isActive', 'IsActive'], true),
  };
}

function mapVariantAttribute(raw: unknown): ItemVariantAttribute {
  const o = readObj(raw);
  return {
    attributeId: readNum(o, ['attributeId', 'AttributeId']),
    attributeName: readStr(o, ['attributeName', 'AttributeName']),
    attributeCode: readStr(o, ['attributeCode', 'AttributeCode']),
    attributeValueId: readOptInt(o, ['attributeValueId', 'AttributeValueId']),
    value: readStr(o, ['value', 'Value']),
  };
}

function mapSpecification(raw: unknown): ItemSpecification {
  const o = readObj(raw);
  return {
    id: readNum(o, ['id', 'Id']),
    specName: readStr(o, ['specName', 'SpecName']),
    specValue: readStr(o, ['specValue', 'SpecValue']),
    sortOrder: readNum(o, ['sortOrder', 'SortOrder']),
  };
}

export function mapItemGroup(raw: unknown): ItemGroup {
  const o = readObj(raw);
  return {
    id: readNum(o, ['id', 'Id']),
    name: TextFormatter.entityName('itemGroup', readStr(o, ['name', 'Name'])),
    parentId: readOptInt(o, ['parentId', 'ParentId']),
    parentName: (() => {
      const n = readStr(o, ['parentName', 'ParentName']);
      return n ? TextFormatter.entityName('itemGroup', n) : null;
    })(),
    description: TextFormatter.description(readStr(o, ['description', 'Description'])),
    sortOrder: readNum(o, ['sortOrder', 'SortOrder']),
    isActive: readBool(o, ['isActive', 'IsActive'], true),
    itemCount: readNum(o, ['itemCount', 'ItemCount']),
    childCount: readNum(o, ['childCount', 'ChildCount']),
    createdAt: readStr(o, ['createdAt', 'CreatedAt']),
    updatedAt: readStr(o, ['updatedAt', 'UpdatedAt']),
  };
}

export function mapItemAttribute(raw: unknown): ItemAttribute {
  const o = readObj(raw);
  const valuesRaw = o['values'] ?? o['Values'];
  const values = Array.isArray(valuesRaw) ? valuesRaw.map(mapAttributeValue) : [];
  const valueType = readStr(o, ['valueType', 'ValueType']) as ItemAttributeValueType;
  return {
    id: readNum(o, ['id', 'Id']),
    name: TextFormatter.entityName('itemAttribute', readStr(o, ['name', 'Name'])),
    code: readStr(o, ['code', 'Code']),
    valueType: valueType || 'Text',
    isVariantAttribute: readBool(o, ['isVariantAttribute', 'IsVariantAttribute']),
    sortOrder: readNum(o, ['sortOrder', 'SortOrder']),
    isActive: readBool(o, ['isActive', 'IsActive'], true),
    values,
    createdAt: readStr(o, ['createdAt', 'CreatedAt']),
    updatedAt: readStr(o, ['updatedAt', 'UpdatedAt']),
  };
}

export function mapItemListItem(raw: unknown): ItemListItem {
  const o = readObj(raw);
  const attrsRaw = o['variantAttributes'] ?? o['VariantAttributes'];
  const variantAttributes = Array.isArray(attrsRaw) ? attrsRaw.map(mapVariantAttribute) : [];
  const status = readStr(o, ['status', 'Status']) as ItemStatus;
  return {
    id: readNum(o, ['id', 'Id']),
    itemCode: readStr(o, ['itemCode', 'ItemCode']),
    itemName: readStr(o, ['itemName', 'ItemName']),
    itemGroupId: readOptInt(o, ['itemGroupId', 'ItemGroupId']),
    itemGroupName: readStr(o, ['itemGroupName', 'ItemGroupName']),
    status: status === 'Inactive' ? 'Inactive' : 'Active',
    hasVariants: readBool(o, ['hasVariants', 'HasVariants']),
    parentItemId: readOptInt(o, ['parentItemId', 'ParentItemId']),
    parentItemName: readStr(o, ['parentItemName', 'ParentItemName']),
    variantCount: readNum(o, ['variantCount', 'VariantCount']),
    variantAttributes,
    steelRate: readNum(o, ['steelRate', 'SteelRate']),
    createdAt: readStr(o, ['createdAt', 'CreatedAt']),
    updatedAt: readStr(o, ['updatedAt', 'UpdatedAt']),
  };
}

export function mapItemDetail(raw: unknown): ItemDetail {
  const base = mapItemListItem(raw);
  const o = readObj(raw);
  const specsRaw = o['specifications'] ?? o['Specifications'];
  const templateRaw = o['templateAttributes'] ?? o['TemplateAttributes'];
  const variantsRaw = o['variants'] ?? o['Variants'];
  return {
    ...base,
    description: readStr(o, ['description', 'Description']),
    specifications: Array.isArray(specsRaw) ? specsRaw.map(mapSpecification) : [],
    templateAttributes: Array.isArray(templateRaw) ? templateRaw.map(mapVariantAttribute) : [],
    variants: Array.isArray(variantsRaw) ? variantsRaw.map(mapItemListItem) : [],
  };
}

export function mapPagedItems(raw: unknown): PagedResult<ItemListItem> {
  const o = readObj(raw);
  const itemsRaw = o['items'] ?? o['Items'];
  const items = Array.isArray(itemsRaw) ? itemsRaw.map(mapItemListItem) : [];
  const totalCount = readNum(o, ['totalCount', 'TotalCount']);
  const pageSize = readNum(o, ['pageSize', 'PageSize']) || 20;
  const page = readNum(o, ['page', 'Page']) || 1;
  const totalPages = readNum(o, ['totalPages', 'TotalPages']) ||
    Math.max(1, Math.ceil(totalCount / pageSize));
  return { items, totalCount, page, pageSize, totalPages };
}

export function toItemGroupBody(dto: {
  name: string;
  parentId: number | null;
  description: string;
  sortOrder: number;
  isActive: boolean;
}): Record<string, unknown> {
  const normalized = TextFormatter.entity('itemGroup', {
    name: dto.name,
    description: dto.description,
  });
  return {
    name: String(normalized['name'] ?? ''),
    parentId: dto.parentId,
    description: String(normalized['description'] ?? ''),
    sortOrder: dto.sortOrder,
    isActive: dto.isActive,
  };
}

export function toItemAttributeBody(dto: {
  name: string;
  code: string;
  valueType: string;
  isVariantAttribute: boolean;
  sortOrder: number;
  isActive: boolean;
  values: { id?: number; value: string; sortOrder: number; isActive: boolean }[];
}): Record<string, unknown> {
  return {
    name: TextFormatter.entityName('itemAttribute', dto.name),
    code: dto.code,
    valueType: dto.valueType,
    isVariantAttribute: dto.isVariantAttribute,
    sortOrder: dto.sortOrder,
    isActive: dto.isActive,
    values: dto.values.map((v) => ({
      id: v.id,
      value: v.value,
      sortOrder: v.sortOrder,
      isActive: v.isActive,
    })),
  };
}

export function toItemUpsertBody(dto: {
  itemCode: string;
  itemName: string;
  itemGroupId: number | null;
  description: string;
  steelRate: number;
  status: string;
  hasVariants: boolean;
  variantAttributeIds: number[];
  specifications: { id?: number; specName: string; specValue: string; sortOrder: number }[];
}): Record<string, unknown> {
  return {
    itemCode: dto.itemCode,
    itemName: dto.itemName,
    itemGroupId: dto.itemGroupId,
    description: dto.description,
    steelRate: dto.steelRate,
    status: dto.status,
    hasVariants: dto.hasVariants,
    variantAttributeIds: dto.variantAttributeIds,
    specifications: dto.specifications.map((s) => ({
      id: s.id,
      specName: s.specName,
      specValue: s.specValue,
      sortOrder: s.sortOrder,
    })),
  };
}

export function toVariantGenerateBody(dto: {
  attributes: { attributeId: number; values: string[] }[];
  status: string;
  skipExisting: boolean;
}): Record<string, unknown> {
  return {
    attributes: dto.attributes.map((a) => ({
      attributeId: a.attributeId,
      values: a.values,
    })),
    status: dto.status,
    skipExisting: dto.skipExisting,
  };
}

export function mapQuotationCatalog(raw: unknown): QuotationCatalog {
  const o = readObj(raw);
  const colsRaw = o['dynamicColumns'] ?? o['DynamicColumns'];
  const itemsRaw = o['items'] ?? o['Items'];
  const dynamicColumns: QuotationCatalogColumn[] = Array.isArray(colsRaw)
    ? colsRaw.map((c) => {
        const col = readObj(c);
        return {
          key: readStr(col, ['key', 'Key']),
          label: readStr(col, ['label', 'Label']),
          source: readStr(col, ['source', 'Source']),
          sortOrder: readNum(col, ['sortOrder', 'SortOrder']),
        };
      })
    : [];
  const items: QuotationCatalogItem[] = Array.isArray(itemsRaw)
    ? itemsRaw.map((item) => {
        const row = readObj(item);
        const attrsRaw = row['attributes'] ?? row['Attributes'];
        const specsRaw = row['specifications'] ?? row['Specifications'];
        return {
          id: readNum(row, ['id', 'Id']),
          itemCode: readStr(row, ['itemCode', 'ItemCode']),
          itemName: readStr(row, ['itemName', 'ItemName']),
          description: readStr(row, ['description', 'Description']),
          steelRate: readNum(row, ['steelRate', 'SteelRate']),
          unitWeight: readNum(row, ['unitWeight', 'UnitWeight']),
          attributes: Array.isArray(attrsRaw) ? attrsRaw.map(mapVariantAttribute) : [],
          specifications: Array.isArray(specsRaw) ? specsRaw.map(mapSpecification) : [],
        };
      })
    : [];
  return { dynamicColumns, items };
}

export function toVariantUpsertBody(dto: {
  itemCode?: string;
  status: string;
  attributes: { attributeId: number; attributeValueId?: number | null; customValue: string }[];
  specifications: { id?: number; specName: string; specValue: string; sortOrder: number }[];
}): Record<string, unknown> {
  return {
    itemCode: dto.itemCode,
    status: dto.status,
    attributes: dto.attributes.map((a) => ({
      attributeId: a.attributeId,
      attributeValueId: a.attributeValueId,
      customValue: a.customValue,
    })),
    specifications: dto.specifications.map((s) => ({
      id: s.id,
      specName: s.specName,
      specValue: s.specValue,
      sortOrder: s.sortOrder,
    })),
  };
}

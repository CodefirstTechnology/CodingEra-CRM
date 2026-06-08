export type ItemStatus = 'Active' | 'Inactive';
export type ItemAttributeValueType = 'Text' | 'Number' | 'Select';

export interface ItemGroup {
  id: number;
  name: string;
  parentId: number | null;
  parentName: string | null;
  description: string;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemGroupUpsert {
  name: string;
  parentId: number | null;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ItemAttributeValue {
  id: number;
  attributeId: number;
  value: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ItemAttribute {
  id: number;
  name: string;
  code: string;
  valueType: ItemAttributeValueType;
  isVariantAttribute: boolean;
  sortOrder: number;
  isActive: boolean;
  values: ItemAttributeValue[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemAttributeUpsert {
  name: string;
  code: string;
  valueType: ItemAttributeValueType;
  isVariantAttribute: boolean;
  sortOrder: number;
  isActive: boolean;
  values: ItemAttributeValueUpsert[];
}

export interface ItemAttributeValueUpsert {
  id?: number;
  value: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ItemSpecification {
  id: number;
  specName: string;
  specValue: string;
  sortOrder: number;
}

export interface ItemSpecificationUpsert {
  id?: number;
  specName: string;
  specValue: string;
  sortOrder: number;
}

export interface ItemVariantAttribute {
  attributeId: number;
  attributeName: string;
  attributeCode: string;
  attributeValueId: number | null;
  value: string;
}

export interface ItemVariantAttributeUpsert {
  attributeId: number;
  attributeValueId?: number | null;
  customValue: string;
}

export interface ItemListItem {
  id: number;
  itemCode: string;
  itemName: string;
  itemGroupId: number | null;
  itemGroupName: string;
  status: ItemStatus;
  hasVariants: boolean;
  parentItemId: number | null;
  parentItemName: string;
  variantCount: number;
  variantAttributes: ItemVariantAttribute[];
  steelRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDetail extends ItemListItem {
  description: string;
  specifications: ItemSpecification[];
  templateAttributes: ItemVariantAttribute[];
  variants: ItemListItem[];
}

export interface ItemUpsert {
  itemCode: string;
  itemName: string;
  itemGroupId: number | null;
  description: string;
  steelRate: number;
  status: ItemStatus;
  hasVariants: boolean;
  variantAttributeIds: number[];
  specifications: ItemSpecificationUpsert[];
}

export interface ItemVariantUpsert {
  itemCode?: string;
  status: ItemStatus;
  attributes: ItemVariantAttributeUpsert[];
  specifications: ItemSpecificationUpsert[];
}

export interface ItemVariantGenerateAttribute {
  attributeId: number;
  values: string[];
}

export interface ItemVariantGenerate {
  attributes: ItemVariantGenerateAttribute[];
  status: ItemStatus;
  skipExisting: boolean;
}

export interface ItemListQuery {
  search?: string;
  itemGroupId?: number | null;
  status?: ItemStatus | '';
  parentItemId?: number | null;
  includeVariants?: boolean;
  sortBy?: 'itemName' | 'itemCode' | 'createdAt' | 'updatedAt' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  attributeFilters?: Record<string, string>;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type ItemMasterTab = 'items' | 'groups' | 'attributes';

export type QuotationGridColumnKey =
  | 'srNo'
  | 'itemName'
  | 'description'
  | 'quantity'
  | 'unit'
  | 'weight'
  | 'unitWeight'
  | 'unitRate'
  | 'discountPercent'
  | 'gstPercent'
  | 'amount'
  | `attr:${string}`
  | `spec:${string}`;

export interface QuotationGridColumn {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width: number;
  editable: boolean;
  source?: 'fixed' | 'attribute' | 'specification';
}

export interface QuotationCatalogColumn {
  key: string;
  label: string;
  source: string;
  sortOrder: number;
}

export const FIXED_QUOTATION_GRID_COLUMNS: QuotationGridColumn[] = [
  { key: 'srNo', label: 'Sr No', visible: true, order: 0, width: 56, editable: false, source: 'fixed' },
  { key: 'itemName', label: 'Item Name', visible: true, order: 1, width: 180, editable: true, source: 'fixed' },
  { key: 'description', label: 'Description', visible: true, order: 2, width: 200, editable: true, source: 'fixed' },
  { key: 'quantity', label: 'Quantity', visible: true, order: 3, width: 96, editable: true, source: 'fixed' },
  { key: 'unitRate', label: 'Rate', visible: true, order: 4, width: 104, editable: true, source: 'fixed' },
  { key: 'weight', label: 'Weight', visible: true, order: 40, width: 88, editable: false, source: 'fixed' },
  { key: 'amount', label: 'Total', visible: true, order: 50, width: 112, editable: false, source: 'fixed' },
  { key: 'unit', label: 'Unit', visible: false, order: 90, width: 72, editable: true, source: 'fixed' },
  { key: 'unitWeight', label: 'Unit Weight', visible: false, order: 92, width: 96, editable: false, source: 'fixed' },
  { key: 'discountPercent', label: 'Discount %', visible: false, order: 93, width: 96, editable: true, source: 'fixed' },
  { key: 'gstPercent', label: 'GST % (line)', visible: false, order: 94, width: 80, editable: false, source: 'fixed' },
];

/** @deprecated use mergeQuotationGridColumns */
export const DEFAULT_QUOTATION_GRID_COLUMNS = FIXED_QUOTATION_GRID_COLUMNS;

export function catalogColumnsToGridColumns(
  catalogCols: QuotationCatalogColumn[],
): QuotationGridColumn[] {
  const baseOrder = 10;
  return catalogCols.map((c, i) => ({
    key: c.key,
    label: c.label,
    visible: true,
    order: baseOrder + (c.sortOrder > 0 ? c.sortOrder : i),
    width: 110,
    editable: false,
    source: c.source === 'specification' ? 'specification' : 'attribute',
  }));
}

export function mergeQuotationGridColumns(
  saved: QuotationGridColumn[],
  dynamicCols: QuotationGridColumn[] = [],
): QuotationGridColumn[] {
  const defs = [...FIXED_QUOTATION_GRID_COLUMNS];
  const dynamicKeys = new Set(dynamicCols.map((c) => c.key));
  const allDefs = [
    ...defs,
    ...dynamicCols.filter((d) => !defs.some((f) => f.key === d.key)),
  ];
  const map = new Map(saved.map((c) => [c.key, c]));

  return allDefs
    .map((def, i) => {
      const user = map.get(def.key);
      const isDynamic = dynamicKeys.has(def.key);
      if (!user) {
        return { ...def, order: isDynamic ? def.order : i };
      }
      return {
        key: def.key,
        label: user.label?.trim() || def.label,
        visible: isDynamic ? user.visible !== false : user.visible,
        order: user.order ?? def.order ?? i,
        width: user.width > 0 ? user.width : def.width,
        editable: def.editable,
        source: def.source,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((c, i) => ({ ...c, order: i }));
}

/** @deprecated */
export function mergeGridColumns(saved: QuotationGridColumn[]): QuotationGridColumn[] {
  return mergeQuotationGridColumns(saved);
}

export const NUMERIC_GRID_COLUMN_KEYS = new Set<string>([
  'quantity',
  'weight',
  'unitWeight',
  'unitRate',
  'discountPercent',
  'gstPercent',
  'amount',
]);

export function isDynamicColumnKey(key: string): boolean {
  return key.startsWith('attr:') || key.startsWith('spec:');
}

export function gridColumnFormControl(key: string): string | null {
  switch (key) {
    case 'itemName':
      return 'itemName';
    case 'description':
      return 'description';
    case 'quantity':
      return 'quantity';
    case 'unit':
      return 'uom';
    case 'weight':
      return 'weight';
    case 'unitWeight':
      return 'unitWeight';
    case 'unitRate':
      return 'rate';
    case 'discountPercent':
      return 'discountPercent';
    case 'gstPercent':
      return 'gstPercent';
    case 'amount':
      return 'amount';
    default:
      return isDynamicColumnKey(key) ? null : null;
  }
}

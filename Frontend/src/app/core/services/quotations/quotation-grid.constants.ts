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
  | 'amount';

export interface QuotationGridColumn {
  key: QuotationGridColumnKey;
  label: string;
  visible: boolean;
  order: number;
  width: number;
  editable: boolean;
}

export const DEFAULT_QUOTATION_GRID_COLUMNS: QuotationGridColumn[] = [
  { key: 'srNo', label: 'Sr No', visible: true, order: 0, width: 56, editable: false },
  { key: 'itemName', label: 'Item Name', visible: true, order: 1, width: 160, editable: true },
  { key: 'description', label: 'Description', visible: true, order: 2, width: 200, editable: true },
  { key: 'quantity', label: 'Quantity', visible: true, order: 3, width: 96, editable: true },
  { key: 'unit', label: 'Unit', visible: true, order: 4, width: 72, editable: true },
  { key: 'weight', label: 'Weight', visible: true, order: 5, width: 88, editable: true },
  { key: 'unitWeight', label: 'Unit Weight', visible: true, order: 6, width: 96, editable: true },
  { key: 'unitRate', label: 'Unit Rate', visible: true, order: 7, width: 104, editable: true },
  { key: 'discountPercent', label: 'Discount %', visible: true, order: 8, width: 96, editable: true },
  { key: 'gstPercent', label: 'GST %', visible: true, order: 9, width: 80, editable: true },
  { key: 'amount', label: 'Amount', visible: true, order: 10, width: 112, editable: false },
];

export function mergeGridColumns(saved: QuotationGridColumn[]): QuotationGridColumn[] {
  const map = new Map(saved.map((c) => [c.key, c]));
  return DEFAULT_QUOTATION_GRID_COLUMNS.map((def, i) => {
    const user = map.get(def.key);
    if (!user) return { ...def, order: i };
    return {
      key: def.key,
      label: user.label?.trim() || def.label,
      visible: user.visible,
      order: user.order ?? i,
      width: user.width > 0 ? user.width : def.width,
      editable: def.editable,
    };
  })
    .sort((a, b) => a.order - b.order)
    .map((c, i) => ({ ...c, order: i }));
}

export const NUMERIC_GRID_COLUMN_KEYS = new Set<QuotationGridColumnKey>([
  'quantity',
  'weight',
  'unitWeight',
  'unitRate',
  'discountPercent',
  'gstPercent',
  'amount',
]);

export function gridColumnFormControl(key: QuotationGridColumnKey): string | null {
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
      return null;
  }
}

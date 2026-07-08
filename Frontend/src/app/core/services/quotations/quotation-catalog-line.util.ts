import type { QuotationCatalogItem } from '../item-master/item-master-api.models';
import { slugKey } from './quotation-item-snapshot.util';
import type { QuotationItemSnapshot } from './quotation-item-snapshot.util';
import { resolveUnitWeightFromSnapshot, stringifyItemSnapshot } from './quotation-item-snapshot.util';

export function buildSnapshotFromCatalogItem(item: QuotationCatalogItem): QuotationItemSnapshot {
  const snapshot: QuotationItemSnapshot = {
    attributes: item.attributes.map((a) => ({
      key: slugKey(a.attributeCode || a.attributeName),
      label: a.attributeName,
      value: a.value,
    })),
    specifications: item.specifications.map((s) => ({
      key: slugKey(s.specName),
      label: s.specName,
      value: s.specValue,
    })),
    unitWeight: item.unitWeight,
  };
  snapshot.unitWeight = resolveUnitWeightFromSnapshot(snapshot);
  return snapshot;
}

export function patchLineFromCatalogItem(item: QuotationCatalogItem): Record<string, unknown> {
  const snapshot = buildSnapshotFromCatalogItem(item);
  const unitWeight = snapshot.unitWeight;
  return {
    itemId: item.id,
    itemCode: item.itemCode,
    itemName: item.itemName,
    description: item.description,
    steelRate: 0,
    unitWeight,
    weight: unitWeight,
    rate: 0,
    itemSnapshotJson: stringifyItemSnapshot(snapshot),
    gstPercent: 0,
  };
}

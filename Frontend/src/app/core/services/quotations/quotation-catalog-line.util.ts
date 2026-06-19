import type { QuotationCatalogItem } from '../item-master/item-master-api.models';
import { slugKey } from './quotation-item-snapshot.util';
import type { QuotationItemSnapshot } from './quotation-item-snapshot.util';
import { resolveUnitWeightFromSnapshot, stringifyItemSnapshot } from './quotation-item-snapshot.util';
import { resolveUnitRate } from './quotation-line-calc.util';

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
  const steelRate = item.steelRate;
  const rate = resolveUnitRate(unitWeight, steelRate, 0);
  return {
    itemId: item.id,
    itemCode: item.itemCode,
    itemName: item.itemName,
    description: item.description,
    steelRate,
    unitWeight,
    weight: unitWeight,
    rate,
    itemSnapshotJson: stringifyItemSnapshot(snapshot),
    gstPercent: 0,
  };
}

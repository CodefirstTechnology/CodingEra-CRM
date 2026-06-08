export interface QuotationSnapshotField {
  key: string;
  label: string;
  value: string;
}

export interface QuotationItemSnapshot {
  attributes: QuotationSnapshotField[];
  specifications: QuotationSnapshotField[];
  unitWeight: number;
}

export function parseItemSnapshot(json: string | null | undefined): QuotationItemSnapshot {
  if (!json?.trim()) {
    return { attributes: [], specifications: [], unitWeight: 0 };
  }
  try {
    const raw = JSON.parse(json) as Partial<QuotationItemSnapshot>;
    return {
      attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
      specifications: Array.isArray(raw.specifications) ? raw.specifications : [],
      unitWeight: Number(raw.unitWeight) || 0,
    };
  } catch {
    return { attributes: [], specifications: [], unitWeight: 0 };
  }
}

export function stringifyItemSnapshot(snapshot: QuotationItemSnapshot): string {
  return JSON.stringify(snapshot);
}

export function snapshotFieldValue(snapshot: QuotationItemSnapshot, columnKey: string): string {
  if (!columnKey.startsWith('attr:') && !columnKey.startsWith('spec:')) {
    return '';
  }
  const key = columnKey.split(':').slice(1).join(':');
  const pool = columnKey.startsWith('attr:') ? snapshot.attributes : snapshot.specifications;
  const hit = pool.find((f) => f.key === key);
  return hit?.value ?? '';
}

export function resolveUnitWeightFromSnapshot(snapshot: QuotationItemSnapshot): number {
  if (snapshot.unitWeight > 0) return snapshot.unitWeight;
  const fromSpec = snapshot.specifications.find((s) => isWeightKey(s.key) || isWeightKey(s.label));
  if (fromSpec) {
    const n = Number(fromSpec.value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const fromAttr = snapshot.attributes.find((s) => isWeightKey(s.key) || isWeightKey(s.label));
  if (fromAttr) {
    const n = Number(fromAttr.value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function isWeightKey(value: string): boolean {
  return value.trim().toLowerCase() === 'weight';
}

export function slugKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SnapshotColumnDef {
  key: string;
  label: string;
}

/** Unique dynamic columns from saved line snapshots (view / PDF). */
export function collectDynamicColumnsFromSnapshots(
  lines: { itemSnapshotJson?: string | null }[],
): SnapshotColumnDef[] {
  const map = new Map<string, string>();
  for (const line of lines) {
    const snap = parseItemSnapshot(line.itemSnapshotJson);
    for (const f of snap.attributes) {
      const key = `attr:${f.key}`;
      if (!map.has(key)) map.set(key, f.label?.trim() || f.key);
    }
    for (const f of snap.specifications) {
      const key = `spec:${f.key}`;
      if (!map.has(key)) map.set(key, f.label?.trim() || f.key);
    }
  }
  return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
}

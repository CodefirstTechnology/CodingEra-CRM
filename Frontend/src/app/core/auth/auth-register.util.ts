/** Picks a role id from `GET /api/MasterData/roles` for new user registration. */
export function extractMasterDataRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
  }
  if (raw != null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', '$values']) {
      const v = o[k];
      if (Array.isArray(v)) {
        return v.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
      }
    }
  }
  return [];
}

const PREFERRED_ROLE_NAMES = ['user', 'standard user', 'sales', 'employee', 'member'];

/** Resolves FK `roleId` — prefers a role named “User”, otherwise first active role. */
export function pickRegisterRoleId(rows: Record<string, unknown>[]): number | null {
  const normalized = rows
    .map((r) => ({
      id: Number(r['id']),
      name: String(r['name'] ?? r['description'] ?? '')
        .trim()
        .toLowerCase(),
    }))
    .filter((r) => Number.isFinite(r.id) && r.id > 0);

  for (const pref of PREFERRED_ROLE_NAMES) {
    const hit = normalized.find((r) => r.name === pref || r.name.includes(pref));
    if (hit) return hit.id;
  }
  return normalized[0]?.id ?? null;
}

/** Lazy-loaded `papaparse` — only fetched when CSV import runs. */
type PapaModule = typeof import('papaparse');

let papaModulePromise: Promise<PapaModule> | null = null;

export async function loadLeadImportPapa(): Promise<PapaModule['default']> {
  if (!papaModulePromise) {
    papaModulePromise = import('papaparse');
  }
  const mod = await papaModulePromise;
  return mod.default;
}

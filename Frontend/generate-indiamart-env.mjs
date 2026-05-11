import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(projectRoot, '.env');
const outputPath = resolve(projectRoot, 'src/environments/indiamart-secrets.generated.ts');

function parseDotEnv(source) {
  const values = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const localEnv = existsSync(envPath) ? parseDotEnv(readFileSync(envPath, 'utf8')) : {};

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const indiamartSecrets = {
  pullApiUrl: localEnv.INDIAMART_PULL_API_URL ?? '',
  pushApiUrl: localEnv.INDIAMART_PUSH_API_URL ?? '',
  apiKey: localEnv.INDIAMART_CRM_KEY ?? '',
  webhookToken: localEnv.INDIAMART_WEBHOOK_TOKEN ?? '',
};

const justdialSecrets = {
  enabled: parseBool(localEnv.JUSTDIAL_ENABLED, true),
  useMock: parseBool(localEnv.JUSTDIAL_USE_MOCK, true),
  pullApiUrl: localEnv.JUSTDIAL_PULL_API_URL ?? '',
  apiKey: localEnv.JUSTDIAL_API_KEY ?? '',
  webhookToken: localEnv.JUSTDIAL_WEBHOOK_TOKEN ?? '',
};

const generated = `/* Auto-generated from Frontend/.env. Do not edit or commit real secrets. */
export const indiamartSecrets = ${JSON.stringify(indiamartSecrets, null, 2)} as const;
export const justdialSecrets = ${JSON.stringify(justdialSecrets, null, 2)} as const;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, generated);

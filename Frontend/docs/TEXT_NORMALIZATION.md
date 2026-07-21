# Text normalization (CodingEra CRM)

Frontend utility: `src/app/shared/utils/text-normalizer/`

- Entry point: `TextFormatter` (`index.ts`)
- Apply **before** Reactive Forms validation (`TextFormatter.form`) and at API upsert/import mappers
- **Never** normalize: passwords, tokens, API keys, uploaded file names (see `NEVER_NORMALIZE_KEYS`)

## Entity-aware `name`

Bare `name` is **not** auto-mapped without context. Use:

```ts
TextFormatter.entity('lead', payload);           // name → person
TextFormatter.entity('organization', payload);   // name → company
TextFormatter.entityName('industry', raw);       // master Title Case
TextFormatter.formForEntity(form, 'role');       // form control `name`
```

Canonical maps: `PERSON_NAME_ENTITIES`, `COMPANY_NAME_ENTITIES`, `MASTER_NAME_ENTITIES`, `PRODUCT_NAME_ENTITIES` in `entity-types.ts`.
Unknown entities only apply global sanitization to `name` (no Title Case).

## Person name notes

`formatPersonName` now:
- Title-cases all-caps words (does **not** treat `SAWANT` / `SHREE` as acronyms)
- Expands spaced initials (`I I` → `I. I.`)
- Normalizes honorifics (`MR` → `Mr.`)
- Preserves commas, apostrophes, hyphens, and compact initials (`A.P.`)
- Is applied via `fullName` form controls and `splitFullName()` before API first/last split


| Path | Hook |
|------|------|
| Lead / Deal / Contact / Org create & edit forms | `TextFormatter.form(...)` before validate |
| Create-entity modal | same |
| Lead / Deal PUT·POST bodies | `lead-upsert-body.util` / `deal-upsert-body.util` |
| Contact / Org / Task upsert | `*-api.mapper.ts` |
| Lead Excel/CSV import | `lead-import-api.mapper.ts` |
| Bulk edit | Opens single-record edit → same form + upsert path |

Do **not** add a global HTTP body interceptor — auth and credential payloads must stay untouched.

## Backend recommendation (mirror for security)

Implement the same rules server-side on Create / Update / Import / Bulk endpoints. Suggested .NET shape:

1. Shared library `Crm.TextNormalization` with formatters per field kind (same max lengths as `FIELD_MAX_LENGTH`).
2. Call from FluentValidation validators or a `ITextNormalizer` registered in DI, applied in command handlers **before** persistence.
3. Reject (400) when formatted value fails validation (email, GSTIN, URL, unsupported currency/role) rather than silently storing garbage.
4. Explicitly **skip** properties: `Password`, `Token`, `RefreshToken`, `ApiKey`, `FileName`, binary/`IFormFile`.
5. For dynamic master labels (lead/deal status), normalize casing but do not hard-fail unknown labels if masters are tenant-configurable — match frontend `formatStatus` behavior.
6. Store emails lowercase, GSTIN uppercase, mobiles as `+` + digits (E.164-like), dates as ISO `date` / `datetime`.
7. Re-run normalization on import commit so spreadsheet clients cannot bypass the UI.

Unit-test parity: share golden fixtures (raw → expected) between Angular specs and .NET tests for person name, company abbreviations (`Pvt Ltd`), email, GSTIN, and URL edge cases.

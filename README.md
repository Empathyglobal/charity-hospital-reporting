# Charity Hospital Reporting

Experimental administrative reporting software designed for charity hospitals globally. Anyone may use, adapt and redistribute the original code under the MIT license.

Organize source files, trace report claims back to evidence, preserve revisions, and export a human-reviewed draft. This release includes three neutral examples: a periodic operations report, a program progress report and a case evidence summary. Example data is synthetic. Default configurations contain no credentials or live connections.

## What it does

- Imports TXT, CSV, XLSX, DOCX, PDF and supported images, with preserved originals and source locations.
- Supports bounded archive processing, resumable uploads, source conflict checks and exact decimal summaries where the source permits them.
- Keeps edited revisions and prior originals. Missing evidence stays visible.
- Exports Word and printable HTML. A human must check facts, figures, meaning, consent and recipient suitability.
- Records donations in their original currency without taking payments, converting currencies or posting to an accounting system. Currency selection and fractional-digit validation use the runtime's internationalization data.
- Offers optional server-side OpenAI drafting, disabled by default. Operators must provide their own account, project, model, key, budget and data-sharing approvals.

## Quick start: synthetic local preview

Use Node.js 24 and npm. From a fresh checkout:

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run demo
```

Visit `http://127.0.0.1:4197/reports/` yourself. The preview binds only to loopback, uses an in-memory database, starts with one synthetic source and makes no AI calls. It has no real authentication. Do not upload real records. Stop with Ctrl+C; all preview data disappears.

The preview is an engineering demonstration, not a hospital service. Do not deploy `scripts/demo.mjs` or expose its port publicly.

## Hosted adapter

The source includes a Netlify/PostgreSQL adapter under `backend/reports/hosted` and function entry points under `backend/netlify/functions`. It is intentionally inactive. No deployment automation or existing hosting account is included.

A qualified operator must provision a **new, separate** database and hosting project, review the migration, package native dependencies and OCR assets, configure the static `/reports/` directory and function routes, and test the resulting deployment. Never point this edition at another application's database or reuse its credentials.

Before activation, configure `backend/reports/hosted/config.json` for the operator's own origin and workspace. Configure an operator-chosen username and a scrypt password hash in the server-only `HOSPITAL_REPORT_PASSWORD_HASH` environment variable. `encodePassword` in `hosted/auth.mjs` is the hashing helper. Do not put passwords or keys in the repository, browser bundle or logs.

For optional AI, configure a dedicated server-only `HOSPITAL_REPORT_AI_KEY`, the operator's own project ID and currently available model, explicit data-sharing and spending approval, and accurate current pricing and budget limits. The supplied model, project and approvals are blank; budgets are zero. Merely setting an unrelated `OPENAI_API_KEY` does not activate the service. Provider charges may apply. A local usage estimate is not a provider-enforced spending ceiling.

## Important limits

**Not clinically validated, not an electronic health record, and not ready for sensitive production use.** It does not diagnose, choose treatment or certify a report. No regulatory compliance or real-world adoption is claimed.

The hosted adapter uses a shared login. Everyone with it can view, edit and export that workspace. Named review notes do not establish an independent identity or separation of duties. Production use needs a local security/privacy assessment, suitable individual access controls, audit/retention/backup policies, and tested recovery and incident response.

Source checks can flag unsupported numbers and missing citations; they do not prove that a quotation supports a conclusion. OCR can misread text. Spreadsheet formulas/macros/external links are not executed. A cached formula result can be stale. Donor submission formats and country-specific obligations must be handled locally.

Bundled OCR supports English and Khmer only. The interface and example templates are English. Global intended use does not mean every language, national reporting standard or hospital workflow is already supported.

Bounds include 8 MiB per file, 20 PDF pages, 200,000 extracted characters per file, and 50 files per batch. Large evidence selections fail explicitly rather than silently truncating. See the code for precise format-specific limits.

## Verification

Automated tests cover the neutral templates, safe-off defaults, consent gating, source/revision handling, currency validation, password hashing, HTML/CSV escaping, real TXT/CSV/DOCX/PDF parsing and worker extraction. Tests use synthetic records and no live AI calls.

This edition's interactive browser flows, visual layout, OCR accuracy, real-provider output, hosted multi-user behavior and standalone PostgreSQL concurrency have not been verified. Older test results for other editions are not claimed here.

## License and origin

Original application code and documentation: MIT, copyright Eric Gonzalez-Payne. Third-party components keep their own terms; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

This is a separately prepared source snapshot. It contains no original development history. See [PROVENANCE.md](PROVENANCE.md).

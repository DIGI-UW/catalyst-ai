# Catalyst reporting pathways — integration design draft

**Status:** Four-pathway additions for owner review, 14 September 2026. The
approved shell is retained; CSV import and PostgreSQL extensions are interactive
design artifacts only. Application implementation, real-source verification,
deployment and owner acceptance remain separate.

[Open the Catalyst draft](index.html?view=integration&app=catalyst) ·
[OpenELIS reporting mock](https://digi-uw.github.io/openelis-work/#/reports/custom-data-export) ·
[Integration roadmap](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/openelis-reporting-catalyst-integration.md)

## Ownership and boundary

| Home | Owns |
| --- | --- |
| `openelis-work` | OpenELIS reporting mock, OpenELIS styling, configurable-export and queue requirements |
| Catalyst, this directory | Query-source and CSV-origin Dataset experiences; fictional comparison examples for review |
| Harness integration roadmap and review hub | Cross-project decisions, acceptance milestones and publication links |

The owner clarified this separation during review. The duplicate OpenELIS
screen previously placed in this directory is removed. Use the existing
[OpenELIS reporting design and specification](https://github.com/DIGI-UW/openelis-work/blob/main/designs/reports/custom-data-export.md);
its wizard, configurations and queue remain there. Do not reproduce them in
Catalyst's stylesheet or maintain a second OpenELIS implementation here.

The review hub links out to that canonical OpenELIS mock. This is a reviewer
link outside the product surfaces, not an application handoff. The applications
open independently: no product links, embedded interface, transferred report
criteria is proposed. OpenELIS exports work without AI or Catalyst. Catalyst
independently queries its configured source or imports a deliberately uploaded
CSV. The earlier CSV-only-for-comparison restriction is superseded by lane 2.

Catalyst's [product specification](../../specification.md) and
[binding design](../../dashboard-builder-mvp-design.md) retain ownership of
existing behavior. Their origin-specific additions agree with this draft; the
integration roadmap owns delivery order. The frozen visual reference remains
the shell/style authority.

## Four pathways, one product design

| Lane | Entry and review scope |
| --- | --- |
| 1 | Native OpenELIS CSV → native Superset upload; OpenELIS's mock/spec remain external. No duplicate screens here. |
| 2 | Upload CSV inside Catalyst → review columns/types → explicit confirmation → imported Dataset; no SQL/session step. |
| 3 | Select OpenELIS PostgreSQL → question/refinement → explicit execution → query-backed Dataset. |
| 4 | Select OpenELIS FHIR analytics → existing Spark query path → query-backed Dataset. Real FHIR coverage/freshness differ from the native source. |

All Dataset origins continue into the existing Widget/Dashboard/publication
design. These are complementary workflows, not interchangeable competitors.
The preview illustrates only query/save and import/review/save additions;
chart arrangement and publication retain their existing binding design and
still need real implementation/verification for the new backing connections.

## Import a report

Upload CSV is a collection action beside the **Datasets** heading in **Saved
work**. Explore stays focused on writing questions; navigating to Saved work
and importing must retain the current question and source-bound session. Saved
work remains the active navigation item during import and Dataset review. Review a file name, complete row/column count,
ordered columns, suggested types and full preview table. Types are editable;
identifiers with leading zeros and mixed results such as `<20` remain Text.
Null/blank cells and repeated result rows must survive unchanged.

Confirm import and save Dataset is explicit. File/type errors remain beside the
review; the next-request failure control demonstrates retry without losing
the file or reviewed types. Cancellation creates no saved Dataset. Going back
to Explore retains the question, and returning to Upload CSV retains the import
draft. Reopening a saved import has file/version provenance and no SQL history.
Another upload creates a separate version; previously saved values remain fixed.

To review reopening: Saved work → Upload CSV → use the fictional example →
confirm import and save → Open Dataset. The review wrapper explains this path
and that reloading resets mock data; production persistence remains required.
The review-only **Try CSV import** shortcut (also `?try=csv`) opens the import
review with the fictional file and name prefilled. It preserves any existing
import draft and question; saving still requires explicit confirmation. This
shortcut belongs to the review wrapper, not the application navigation.

Both query and file origins appear under **Datasets**, using the same approved
cards and review treatment. Query-specific actions remain limited to queries.
Production imports retain byte checksum, reviewed schema, complete row count and
immutable version in durable storage; the dedicated PostgreSQL database and
backing-connection identity remain implementation details outside staff UI.

The browser-only parser supports small fictional CSV files (100 KB preview
limit), quoted/escaped values, BOM and line breaks. This is not the production
parser, storage implementation or production file-size policy. Nothing leaves
the page; reload resets mock state. Persisted/restarted application behavior
is an implementation acceptance requirement, not a claim of this mock.

## Catalyst experience

Reuse the approved logo, title typography, neutral light/dark surfaces, spacing,
composer and Explore / Saved work navigation directly from
[the approved design assets](../staff-workbench-ux/index.html).

1. Open Catalyst independently and select OpenELIS PostgreSQL or OpenELIS FHIR
   analytics. The fictional view in this mock is illustrative; production must
   discover the complete readable native/Spark schema, without curated views
   being a prerequisite or an application relation allowlist.
2. Browse the permitted schema alongside the question. The fictional catalog
   represents the complete readable schema of this preview's connection.
3. Write or refine the example question. Continue prepares an inspectable query
   and retrieves no rows. Get results is a separate explicit action.
4. Review the full example result, blank values, repeated accessions and source
   details. Failure retains question and SQL for retry.
5. Save a successful Dataset and reopen its recorded version without executing.
   An unfinished follow-up does not replace the saved result's executed question.
6. Change source by starting a fresh session; resume the earlier source-bound
   session without rewriting it. Resizing and Advanced mode preserve drafts.

This static preview illustrates one query, not arbitrary question interpretation
or SQL execution. Edited SQL remains visible with an explicit preview limitation;
production executes exact selected SQL through its configured connection.
Mock state stays in this page. It makes no clinical, AI or authentication calls.

## Shared identity and equivalent access — future implementation

The Catalyst reviewer controls illustrate Maya Chen with Virology access and no
identifying-field permission, Sign-in required and No reporting access. The
question survives a change in mock access state. OpenELIS illustrates its own
account states in its own design; these previews do not synchronize credentials
or demonstrate working single sign-on.

The integration requirement is the same organizational identity and equivalent
lab-unit and identifying-field permissions in both applications. Shared sign-in
alone does not establish equivalent permissions. Catalyst's current demo excludes
production identity and sensitive-data authorization; real backend/connection
enforcement, download access and access-revocation behavior remain implementation
work. Model instructions or UI hiding cannot enforce those boundaries.

The current four-pathway goal uses synthetic records and existing sign-ins.
Shared identity and equivalent per-user authorization are retained for later
production integration; these preview permission states are future behavior.
The selected FHIR Data Pipes → Parquet → Spark SQL path remains lane 4; ordinary
PostgreSQL is the approved lane 3. Verify coverage, correction/status semantics,
laboratory timezone and source freshness rather than presuming equivalence.

## Fictional comparison examples

The parity tab belongs to review, outside both products. It contains a
downloadable fictional OpenELIS-style CSV and an independently represented
Catalyst result. The query example remains independently represented. Lane 2's
explicit file import is distinct from this record-comparison view.

| Item | Example definition |
| --- | --- |
| Period | August 1–31, 2026, inclusive collection calendar dates |
| Filters | Virology; HIV viral load; Validated result status |
| Row meaning | One result; repeated accessions are not automatically duplicates |
| Columns | Accession number, collection date, lab section, test, result, unit, result status |
| Missing value | Empty CSV cell; displayed as Not recorded |
| Expected output | Five fictional rows, including two distinct results for one accession |

Review examples cover a missing record, loss of a valid second result and an
incorrectly included September 1 record. They preserve multiplicity and blank
values; matching counts alone do not establish parity. These are illustrative
fixtures, not files from a clinical system or evidence of a passing integration.
The native OpenELIS export must itself be checked against source records before
it is used as a real comparison reference.

These August fixtures retain the original dated design example. Iteration 2
aligns demonstration fixtures and new mock labels to the actual native reporting
records/period (the native UAT currently documents May cases), once their source
records are checked. Do not manufacture matching FHIR data or treat the fictional
preview as real-source coverage evidence.

## Validation and acceptance

The design PR records fixture tests, browser question/save/failure/access/session
checks, keyboard and resizing checks, and inspected desktop/narrow light/dark
screenshots against the approved reference. Export/configuration/queue checks
belong to the OpenELIS design PR. Screenshots and raw browser evidence stay in
private/ignored storage.

Run `node --test docs/specs/openelis-reporting-integration/model.test.mjs`.
Serve the parent design directory and open this directory's index for local review.
The harness publishes exact source files beside the approved reference and
records their source commit and hashes. Its reviewer link opens OpenELIS's own
published mock; it does not copy those screens into this repository.

Construction, technical validation, publication, owner design acceptance,
application implementation, real-source parity and deployment are separate
milestones in the integration roadmap. Owner design acceptance is pending.

For this addition, review file selection, suggested/type-corrected columns,
failure/cancel/retry, unchanged question drafts, both source choices and saved
origin details. Check keyboard operation and matched desktop/narrow light/dark
screenshots. Keep raw evidence outside Git. Existing AI-assisted Widget/Dashboard
refinement remains the next stage after the four-pathway goal; it is not
implemented or duplicated in this design change.

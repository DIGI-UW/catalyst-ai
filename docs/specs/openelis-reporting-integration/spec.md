# Catalyst with an OpenELIS source — integration design draft

**Status:** Interactive design for owner review, 10 September 2026. Application
implementation, real-source parity and owner acceptance remain open.

[Open the Catalyst draft](index.html?view=integration&app=catalyst) ·
[OpenELIS reporting mock](https://digi-uw.github.io/openelis-work/#/reports/custom-data-export) ·
[Integration roadmap](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/openelis-reporting-catalyst-integration.md)

## Ownership and boundary

| Home | Owns |
| --- | --- |
| `openelis-work` | OpenELIS reporting mock, OpenELIS styling, configurable-export and queue requirements |
| Catalyst, this directory | The Catalyst-side experience with an independently selected OpenELIS source; fictional comparison examples for review |
| Harness integration roadmap and review hub | Cross-project decisions, acceptance milestones and publication links |

The owner clarified this separation during review. The duplicate OpenELIS
screen previously placed in this directory is removed. Use the existing
[OpenELIS reporting design and specification](https://github.com/DIGI-UW/openelis-work/blob/main/designs/reports/custom-data-export.md);
its wizard, configurations and queue remain there. Do not reproduce them in
Catalyst's stylesheet or maintain a second OpenELIS implementation here.

The review hub links out to that canonical OpenELIS mock. This is a reviewer
link outside the product surfaces, not an application handoff. The applications
open independently: no product links, embedded interface, transferred report
criteria or CSV ingestion is proposed. OpenELIS exports work without AI or
Catalyst. Catalyst independently queries its configured source.

Catalyst's [product specification](../../specification.md) and
[binding design](../../dashboard-builder-mvp-design.md) retain ownership of
existing behavior. This draft does not expand the current Catalyst release
checkpoint or reopen its approved visual reference.

## Catalyst experience

Reuse the approved logo, title typography, neutral light/dark surfaces, spacing,
composer and Explore / Saved work navigation directly from
[the approved design assets](../staff-workbench-ux/index.html).

1. Open Catalyst independently and select OpenELIS Laboratory.
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

The selected FHIR Data Pipes → Parquet → Spark SQL path remains the starting
point. Verify reporting-field coverage, status/correction semantics, laboratory
timezone, source snapshot and freshness before claiming parity. An alternative
source architecture requires a separate roadmap decision.

## Fictional comparison examples

The parity tab belongs to review, outside both products. It contains a
downloadable fictional OpenELIS-style CSV and an independently represented
Catalyst result. Catalyst does not read that CSV.

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

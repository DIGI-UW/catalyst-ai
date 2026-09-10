# OpenELIS reporting and Catalyst integration — design draft

**Status:** Interactive design for owner review. Implements the clarified
mock/spec checkpoint of 10 September 2026. Application implementation, real
source parity and owner acceptance remain open.

[Open the review hub](index.html?view=integration) ·
[Approved Catalyst reference](../staff-workbench-ux/index.html) ·
[Integration roadmap](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/openelis-reporting-catalyst-integration.md)

## Goal and authority

Two independent applications serve clinical/program staff first and analysts
second. OpenELIS performs configurable reporting without AI or Catalyst.
Catalyst queries its configured OpenELIS source through its existing Workbench.
They share organizational sign-in and equivalent data access in the intended
integration. They do not embed or link into one another, transfer report
criteria, or use the exported CSV as Catalyst's source.

This draft owns the new integration interactions illustrated here. The
[OpenELIS export requirements](https://github.com/DIGI-UW/openelis-work/blob/main/designs/reports/custom-data-export.md)
remain the source for its complete variable catalog, compatibility rules and
export/queue contracts. Catalyst's [product specification](../../specification.md)
and [binding design](../../dashboard-builder-mvp-design.md) retain ownership of
existing behavior. This draft does not change the current Catalyst release
checkpoint or replace the approved visual reference.

## OpenELIS Export MVP

1. **Choose fields:** select export columns; see identifying fields locked when
   the account lacks permission. Load a personal saved configuration.
2. **Set filters:** choose a fresh collection-date period, permitted lab section,
   test and result status. Going back preserves choices.
3. **Review and export:** review visible field/filter labels, name the export,
   optionally save reusable choices, and generate the CSV.
4. **My Report Queue:** leave a generating job, return to its status and download
   the finished file. A failure preserves its request and offers a new retry
   job; an expired job restores choices but requires new dates.

Configuration saves omit the date range. Duplicate names require overwrite
confirmation. Estimate failure does not discard input or prevent submission.
The prototype routes example exports through the queue to make that workflow
reviewable; production retains the existing draft's immediate/queued thresholds.

The interactive example contains seven Sample & Testing columns and the
virology scenario. The broader source catalog and other row families are
linked requirements, not implemented by this bounded mock. This is not
approval to reduce production export scope. Patient printing, Jasper
replacement, automatic scheduling and dashboards are outside this design.

## Catalyst experience

Reuse the approved appearance and presentation assets directly, including its
mark, title typography, neutral surfaces, composer and Explore / Saved work
navigation. Integration styles add only the new surfaces and responsive layout.

- Select OpenELIS independently. Browsing its permitted schema remains nonmodal
  and usable while drafting. The illustrated catalog is fictional and represents
  the complete readable schema for this preview's connection.
- Write or refine the example question. Continue prepares an inspectable query
  but retrieves no rows. Get results is a separate, explicit action.
- Preserve question, SQL and source through a failed request and retry.
  General Advanced mode and resizing preserve draft and results.
- Save a successful Dataset and reopen the saved version without executing
  again. Its source and recorded results remain visible.
- Changing source starts a fresh session and retains the earlier session.
  It never rewrites the source of existing work.

The static preview illustrates one query; it does not interpret arbitrary
questions or SQL. Edited SQL remains visible, with an explicit preview
limitation instead of silently substituting the example. Production still
executes exact selected SQL according to the existing contract.

## Shared sign-in and equivalent access

The reviewer can select Signed in, Sign-in required or No reporting access.
Both application previews reflect the same fictional account state, without
requests to an identity provider. Signing back in restores each application's
own draft. Preview controls live outside the product surfaces.

The example staff member can read Virology results but cannot read identifying
fields. OpenELIS visibly locks those fields; Catalyst's readable source does
not expose them. No-reporting-access blocks both result surfaces.

**Implementation work remains:** Catalyst's current demo excludes production
identity and authorization. Shared organizational sign-in, lab-unit access,
field access, download authorization and access-revocation behavior require
real implementation and review before production use. They must be enforced by
the backend/configured data access, not UI hiding or model instructions.
This draft adds no relation allowlist, SQL translation or connector framework.

## Parity scenario and evidence boundary

The review-only tab is outside both products and adds no staff comparison
feature. It uses independent fictional representations of:

| Item | Example definition |
| --- | --- |
| Period | August 1–31, 2026, inclusive collection calendar dates |
| Filters | Virology; HIV viral load; Validated result status |
| Row meaning | One result; repeated accessions are not automatically duplicates |
| Columns | Accession number, collection date, lab section, test, result, unit, result status |
| Missing result | Empty CSV cell; displayed as Not recorded |
| Expected output | Five fictional rows, including two distinct results for one accession |

The comparison examples cover matching data, a missing record, loss of a valid
second result and an incorrectly included September 1 record. Comparison
preserves multiplicity and blank values; equal counts alone do not prove parity.
The CSV can be downloaded and inspected. Neither representation is read from a
clinical system, and the Catalyst mock does not consume the CSV.

Before real parity review, agree actual field mappings, source snapshot/refresh
cutoff, laboratory timezone, status/correction semantics and record references.
Inspect source records to validate the native CSV before treating it as a
comparison reference. The existing FHIR Data Pipes → Parquet → Spark SQL path
remains the starting point. Verify coverage and freshness; an alternative path
requires a separate explicit roadmap decision.

## Review and delivery

| Checkpoint | State |
| --- | --- |
| Clarification and draft construction | Complete; owner choices reflected here |
| Local technical validation | Five fixture tests and browser journey checks passed; desktop/narrow light/dark screenshots inspected. See the design PR for the validation scope. |
| Published preview | Tracked by the harness review hub; its source revision identifies the published version. Publication is separate from owner approval. |
| Owner design acceptance | Pending |
| Product implementation and real-source parity | Separate work; not proven by this mock |

Local review: serve the parent design directory over HTTP and open this folder's
index with `?view=integration`. Run fixture checks with
`node --test docs/specs/openelis-reporting-integration/model.test.mjs`.

Review the complete export/configuration/queue and Catalyst question/save paths,
failure and retry, fresh dates, source/session retention, permissions, light/dark
appearance, narrow layouts, keyboard focus and CSV download. Compare Catalyst's
presentation against the approved view in the same hub.

The harness publishes these source files beside the approved assets and
records their exact source commit. Its synchronization check verifies bytes and
the generated specification/revision links. Updating a runtime submodule pin
alone does not update the preview. Generated screenshots and raw browser
evidence stay in private/ignored storage, not in this design directory.

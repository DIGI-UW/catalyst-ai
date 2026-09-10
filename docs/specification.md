# Catalyst product specification

**Status:** Current product contract. The query notebook, frozen staff Workbench
design, and binding Dashboard Builder design are accepted. The harness Feature
008 task register tracks implementation, deployment, and owner acceptance.

The [frozen staff Workbench design](specs/staff-workbench-ux/spec.md) is dated
design evidence for this contract. Its accepted application behavior is
incorporated below; delivery order and progress are owned by the validation
harness Feature 008 plan and tasks.

## Purpose

Catalyst helps a person:

- ask a data question;
- inspect and edit the generated SQL;
- run the exact selected query against a configured source;
- inspect bounded rows or the database error;
- refine the query in conversation;
- save a successful result as a Dataset;
- create Widgets and a Dashboard; and
- publish a deterministic native bundle for Superset.

Catalyst is a generic SQL-connected application. It does not own ingestion, a
clinical warehouse, or a preferred database engine.

## Product boundary

A source supplies:

- a stable identity and label;
- connection configuration or a connection reference;
- an explicit SQL dialect;
- independent availability; and
- every table, view, column, and type readable through that connection.

Optional source annotations may add descriptions, relationships, units, or
examples. They cannot hide, approve, or rank readable relations.

A session binds one source at creation. Selecting another source starts another
session. An unavailable source does not prevent application startup or another
source from being used.

med-agent-hub owns configured model profiles, prompts, role-to-model mapping, and
model settings. Catalyst owns request context, conversation and query versions,
advisory validation, connection execution, results, and Dashboard Builder state.

Superset owns rendering. Catalyst owns deterministic bundle generation and
publication status based on explicit importer receipts.

## Architecture

```text
person
  -> Catalyst UI
  -> Catalyst Gateway
       -> med-agent-hub for configured model roles
       -> configured SQL connection for schema and exact execution
       -> SQLite for Catalyst operating metadata
       -> outbox for Superset bundles
  -> Superset using the same configured data source
```

Generated and manually edited queries use shared connection-execution code.
Catalyst does not translate SQL between engines.

## Query workbench

### Presentation and disclosure

Catalyst is designed first for clinical and program staff who do not know SQL,
and second for analysts. The initial Workbench leads with “What would you like
to find out?”, the selected source, a short prepare/review/run explanation, and
the question field. It does not lead with schema cards, model names, traces, or
development navigation.

The main navigation is **Explore** and **Saved work**. Saved work contains
**Saved queries**, **Charts and tables**, and **Dashboards** while retaining the
Dataset, Widget, and Dashboard domain names in APIs and evidence. Use a centered
content surface instead of a permanent development-style sidebar.

Complexity is hidden until requested and never discarded. **View options**
contains Appearance and an on/off switch for visit-scoped, workspace-wide
**Advanced mode** that defaults off. Switching it preserves the draft, editor selection, SQL,
parameters, source, query and execution identities, results, selected profile,
and focus. The same individual capabilities remain reachable through named
disclosures in the simple view. Query settings exposes profile selection;
exact model identities and traces remain available in technical details rather
than as an always-visible badge.

Appearance offers System, Light, and Dark using the existing theme preference.
Light mode uses neutral surfaces, dark text, and restrained violet actions.
Dark mode uses charcoal surfaces, off-white text, and violet actions and focus;
purple is not used for body, navigation, or link text. A small OpenClinAI purple
mark may use a tiny gold detail. Warning, error, and success colors retain their
semantic meaning.

Interface typography follows the rendered approved staff mock: system sans-serif
text, medium-weight headings and labels, and the purple Catalyst mark with its
small gold highlight. Carbon remains the control framework; its default type
scale does not override the approved visual hierarchy. SQL retains IBM Plex Mono.

### Session creation

The person selects one available source and one available model profile, asks a
question, and starts a session. The model request receives:

- the current instruction;
- source identity and declared SQL dialect;
- the complete readable schema;
- applicable optional descriptions;
- the configured writer/checker profile; and
- relevant same-session context.

The application records what was actually sent and any omission with its reason.
It does not silently summarize, rank, or substitute context. Result rows never
enter model context.

### Writer responses

The writer returns one of:

- `ready`: a query candidate;
- `needs_clarification`: one question and no SQL;
- `unsupported`: a concise explanation and no SQL.

Contract or orchestration failure remains a failure. Clarification and
unsupported turns execute no SQL and preserve the previous selected query.

### Editor and Run

The latest turn contains exactly one editable SQL control. It supports:

- highlighting, formatting, and keyword/function completion for the declared
  dialect;
- relation and column completion from the same readable schema supplied to the
  model;
- typed parameters;
- visible model output and failure evidence;
- advisory findings;
- immutable query versions;
- Clear and Restore; and
- explicit Run.

Formatting and validation never execute SQL. Findings never disable Run or
rewrite SQL.

Run saves the exact visible draft as an immutable version and submits its exact
SQL and typed parameters through the configured connection. Catalyst applies a
time limit and returned-row limit. The connection or reference deployment
prevents mutation of source data. Reference-deployment acceptance submits one
intentional write attempt through the configured connection and records its
visible refusal without changing source data.

Success retains typed columns, bounded rows, counts, source, dialect, readable
schema reference, query identity, and timing. Failure retains the error returned
by the database. A bad query or database error remains a valid observable result.

### Question composer

The initial question and follow-up forms share one presentation while retaining
their existing request handlers and state owners. The composer stays at the
bottom of Workbench and reserves its measured height so it never covers focused
controls or the latest result. It starts at about three comfortable lines and
supports native vertical resizing from about 72 pixels up to 40 percent of the
viewport, capped at 360 pixels on desktop and lower on narrow screens. Expand
and Restore are explicit keyboard-operable controls. The chosen size, entered
text, selection, and focus survive preparation, resizing, failure, and retry
for the active visit.

The visible label is “Your question”, “Ask a follow-up”, or “Your answer” for a
clarification. Follow-up context identifies the earlier question and selected
query and states when an edited query is used. **Continue** prepares a candidate
and never executes SQL; **Get results** is the explicit execution action.
Command or Control plus Enter performs the same prepare action, while Enter
inserts a newline. Busy and error states prevent duplicate requests, announce
progress or failure, retain the draft, and provide Retry.

### Conversation and state

A follow-up uses the current visible editor state, prior user instructions,
relevant failure information, and eligible verified examples from the same
source and session. Earlier material cannot replace the current instruction.

Earlier turns become readable summaries. Only the latest turn owns the editor.
A result remains inspectable but is marked stale when the visible query changes.
Refresh restores the session, selected query, findings, executions, result
state, and saved Dashboard Builder objects. New session is the only action that
clears the active thread.

## Available data

“What data is available?” opens a nonmodal companion that remains usable beside
the question draft. It shows every readable relation, column, and declared type
from the active connection. Search matches relation names, optional descriptions,
column names, and exact identifiers. Browsing schema never retrieves source rows.
The browser preserves the draft, selection, composer size, search, expanded
relations, scroll position, and focus return. It is searchable, filterable, and
paginated and has clear empty, no-match, loading, unavailable, and retry states.
On narrow screens it becomes a full-height sheet without discarding either the
draft or browser state.

Refreshing schema discovery reflects current connection access. A changed
schema is visible and recorded but does not by itself prevent application
startup or discard saved evidence.

## Dashboard Builder

The binding interaction and visual contract is
[dashboard-builder-mvp-design.md](dashboard-builder-mvp-design.md).
The approved visual reference is the
[staff Workbench preview](specs/staff-workbench-ux/index.html).

A Dashboard Builder Dataset is an immutable saved query and execution artifact.
It is not a source, warehouse, or restricted schema copy.

### Dataset

- Only a successful execution for the exact current query may create or refresh
  a Dataset draft.
- The Dataset review panel owns the full bounded typed table.
- Save is immutable and idempotent for identical content.
- Each Dataset retains source, dialect, readable-schema reference, SQL,
  parameters, execution identity, typed shape, warnings, and recorded
  configuration.
- Saving uses the source recorded with the originating session. If that identity
  is missing, ask the person to run the query in a new session before saving;
  never substitute a default connection.

**Start from this SQL** in Saved queries loads the saved Dataset's exact
parameterized SQL and typed parameter values into the single editor. It retains
the starting Dataset version and source/dialect, creates a new draft, and never
executes SQL or changes the saved version. Preserve any ongoing draft; using a
different source requires an explicit matching or new session. Compiled SQL
remains the saved execution snapshot, not the editable source. Saved query
configuration stays available when detailed originating execution evidence
cannot be loaded; report the missing evidence separately. New saved queries
record the session's declared dialect; older saves show when it was not recorded.
The reuse flow confirms opening a new session on the saved source and preserves
question, follow-up, SQL and typed values in the existing session browser state
before switching. A failed save or session creation leaves the draft available
for retry. The starting Dataset version remains visible, and Return to previous
draft restores the preserved session. Creating the copy does not generate or run
SQL; Run continues through the existing query-version execution path.

### Widget

- Compatibility and the initial visualization suggestion are deterministic from
  the Dataset's typed shape.
- The person reviews the suggestion and may choose another compatible type.
- A saved Widget is immutable and retains its Dataset identity and bindings.
  Review a saved chart before editing it; saving changes creates a new version
  with the same logical identity and leaves earlier versions unchanged.
- The accepted visualization families are table, key value, time series,
  grouped or stacked bar, and proportion bar.

### Dashboard

- A Dashboard arranges multiple saved Widgets from one source.
- Each Dataset keeps its own readable-schema reference; a harmless later schema
  refresh does not block same-source composition.
- A saved Dashboard is immutable and keeps stable logical identity across
  versions. Review and arrange a saved Dashboard to change chart order and widths
  (full, half, or third of a row). Reopening restores that arrangement; native
  Superset publication preserves it and keeps the stable Dashboard address.
- Retrying an identical save returns the existing saved version. A save failure
  leaves the arrangement and other draft fields available for correction/retry.

### Publication and import

- Publish writes a deterministic native Superset bundle to the outbox and offers
  the same bytes for download.
- The bundle contains configuration and recorded identities, not result rows.
- Status follows explicit importer receipts. File existence alone is not
  imported.
- Failures remain actionable and do not expose false success or Open controls.
- The stable Dashboard URL opens only after successful import.
- Superset renders the saved queries against the configured source.
- Acceptance inspects one displayed value against the originating Catalyst
  result without a second database query.

Superset application programming interface publication, embedded viewing,
bidirectional synchronization, sharing, scheduling, automatic refresh, and
model-generated chart specifications are later work.

The [design extension proposal](specs/staff-workbench-ux/proposals/catalyst-output-integrations-hiv-draft.md)
supplies follow-on design inputs for multi-artifact requests, shared controls,
Metabase and Evidence. The harness Feature 008 plan schedules them after current
usability and Superset delivery. Their detailed contracts remain subject to that
milestone's review; they are not current Dashboard completion requirements.

## Selected reference deployment

For each source included in the selected demonstration or comparison:

```text
FHIR source
  -> pinned FHIR Data Pipes
  -> Parquet and applicable ViewDefinitions
  -> Spark SQL
  -> Catalyst and Superset
```

The ingestion configuration, ViewDefinitions, Parquet, Spark service, and
optional source descriptions belong to the reference deployment, not Catalyst
core. OpenELIS assets are packaged in `analytics/` for convenience.

Each included source receives one live end-to-end proof when integrated:

- nonempty Parquet and applicable ViewDefinitions;
- one manual Spark query proving the endpoint and a known fact;
- the same readable tables discovered by Catalyst;
- one successful exact query and one database error in the browser;
- one intentional write attempt visibly refused without changing source data;
- one Dataset-to-Superset render; and
- confirmation that source data remains unchanged after the refused attempt.

The manual Spark query is a one-time materialization check. It does not become a
second harness or per-run comparison path.

## Delivery authority

Program sequence, reference-environment integration, evidence, and owner gates
are owned by the validation harness Feature 008 specification, plan, and tasks.
Those documents apply this product contract without redefining application
behavior.

## Accessibility

All interactive controls remain keyboard operable with logical order, visible
focus, usable announcements, Escape and focus return for overlays, reduced
motion, and usable desktop, short-viewport, 640-, 390-, and 320-CSS-pixel
layouts. Overlays contain focus, Escape closes them, and focus returns to their
invoker or a named replacement. Composer resizing and disclosure changes do not
obscure focused content.

## Out of scope

- an application relation allowlist, fixed relation count, or relation ranking;
- a connector framework or SQL translation;
- a shadow analytics warehouse or automatic database fallback;
- result rows in model context;
- automatic query execution;
- a second database path for acceptance;
- production authentication, authorization, row-level access, or sensitive-data
  controls for the demo stage;
- reseed, restart-persistence, environment-parity, repeated-model-run, or
  exhaustive infrastructure-failure gates; and
- automatic scoring, ranking, or model-team selection.

# Catalyst Dashboard Builder MVP design

**Status:** Binding Dashboard Builder interaction and visual contract
**Interactive reference:** [Approved staff Workbench preview](specs/staff-workbench-ux/index.html)

This document is the current interaction and visual contract for the Workbench
and Dashboard Builder. The owner-frozen staff Workbench mock is the visual
reference for the shell, composer, Available data, disclosure, and appearance.
The written requirements below define Dashboard object flow, reviews, libraries,
arrangement, and publication, including states the illustrative mock does not
implement. The written contract controls if the mock cannot express a state.

The [frozen design](specs/staff-workbench-ux/spec.md) and
[overlap review](specs/staff-workbench-ux/overlap.md) retain dated design evidence.
Their accepted requirements are incorporated here. The earlier HTML prototypes
were retired on 10 September 2026; see [retirement accounting](#prototype-retirement).

## Current product decisions

The decisions below govern the detailed design that follows.

- **Explore is the Workbench.** The primary navigation uses Explore and Saved
  work. Saved work groups Saved queries, Charts and tables, and Dashboards;
  API and evidence names remain Dataset, Widget, and Dashboard.
- **Validation is advisory.** Validate reports findings for the exact editor
  state, does not execute SQL, and never disables Run. The visible controls are
  Format, Validate, and Run.
- **The Dataset tile lives in the cell that produced it,** expanded by default
  and spanning the thread's width, rather than as a single standalone tile
  owned by the panel. It is still the sole bounded typed-result presentation,
  and a run is still never rendered twice on one page.
- **A run's outcome leads, including a failure.** A completed run closes the
  editor and moves to the cell carrying the result; only a failure of the
  action itself, which records no execution, leaves the editor open.
- **Version numbers leave the thread.** Cells are numbered `[n]` by position;
  query-version and execution ordinals appear only in the details and
  dataset-review surfaces, which are the provenance views.
- **One source per session.** Changing the Data source control starts a new
  session; an existing thread never silently switches its connection or schema.
- **Available data is complete and nonmodal.** It shows every table, view,
  column, and type readable through the configured connection beside the draft,
  without retrieving source rows. Optional descriptions may enrich the display
  but cannot hide relations.
- **Complexity is disclosed.** View options contains Appearance and a
  visit-scoped Advanced mode. Simple and Advanced presentations share state and
  capabilities; switching never discards a draft, source, query, result, profile,
  or focus.

## MVP interaction contract

The prototype's chronological thread, Dataset tile,
and review panel are the required target experience. Production must integrate
the accepted query notebook into them and retain profile/model selection and
evidence, exactly one SQL editor with completion/formatting/wrapping, manual
versions and unresolved snapshots, advisory Validate, explicit Run, visible raw
generation/failure evidence, findings, database diagnostics and typed results,
contextual follow-up, compact history, result staleness, refresh restoration,
complete readable-schema access, and one canonical New session action through
**Save Dataset**. The Dataset tile exists only after a successful execution for
the exact query digest; it opens the sole bounded typed-result presentation in
the Dataset panel. Do not implement example prompts or implied automatic
generation/execution. Available data owns schema browsing, and the Dataset draft
tile and review panel own the successful execution result.

The accepted Ask invariants are testable requirements:

- **ASK-01 — one work surface:** a populated session has one editable SQL
  control whose accessible name is exactly `SQL query`, one resizable question/
  follow-up composer, and exactly one New session action. Completion/formatting/
  wrapping help is descriptive text outside the label.
- **ASK-02 — behavioral parity:** Format, Validate, explicit Run, typed
  parameters, raw generation/failure evidence, findings, database diagnostics,
  version provenance, Clear/Restore, result staleness, refresh restoration, and
  available profile/model selection remain reachable.
- **ASK-03 — contextual refinement:** the composer identifies the exact
  visible Query vN/editor snapshot on which the next complete query is based.
- **ASK-04 — available-data context:** a keyboard-operable nonmodal companion
  exposes every relation and column readable through the active source through
  the complete searchable/filterable/paginated browser, including its no-match,
  empty, loading, unavailable, and failure states. Browsing does not retrieve
  source rows or discard the question draft.
- **DATASET-01 — explicit transition:** only a successful Run for the exact
  editor digest creates or refreshes a Dataset draft tile.
- **DATASET-02 — one result presentation:** the active card reports execution
  status/counts but no row table; the Dataset panel owns the full bounded typed
  table, truncation/empty/value warnings, and paging. When execution is
  truncated without an exact total, every surface says how many rows are shown,
  that more are available, and that the total is unknown.
- **DATASET-03 — lineage:** edits or successor generation keep the prior result
  visible but mark its tile stale until the new exact digest runs successfully.
- **DATASET-04 — durable save:** Save dataset is single-shot and idempotent and
  survives refresh as an immutable version.
- **THREAD-01 — chronology:** earlier turns collapse to read-only summaries and
  only the latest turn owns the active workbench.
- **A11Y-01 — working surface access:** all controls are reachable in logical
  keyboard order through the desktop, 390×844, 320-CSS-pixel, and
  640-CSS-pixel reflow checks; focus is visible; Escape closes the review panel
  and restores its invoker; fixed regions do not cover focused content; reduced
  motion is respected. Actual 200% browser zoom is deferred polish and is not an
  MVP gate.

1. Superset 6.1.0 is the dashboard renderer. Catalyst does not build a parallel
   chart runtime. Because the MVP is a one-way file handoff, Catalyst remains the
   desired-configuration source of truth and Superset-only layout edits are
   overwritten on the next publication; collaborative Superset ownership is
   deferred with API/export reconciliation.
2. Catalyst owns persistent, immutable-versioned Dataset, Widget, and Dashboard
   drafts and their libraries. A dashboard may compose multiple saved widgets.
3. The initial visualization suggestion is deterministic from the typed result
   shape and is always reviewable/overridable. Model-generated visualization
   specifications are deferred.
4. `Publish to Superset` atomically creates a deterministic native Superset ZIP
   in a host-visible outbox mounted read-only into Superset and offers the same
   file for download. Stack bootstrap imports the selected bundle; an explicit
   CLI helper imports or updates it in an already-running instance.
   The logical Dashboard UUID remains stable; Dataset and Widget/chart UUIDs
   derive from immutable versions so Superset 6.1.0 can create changed children
   while overwriting the Dashboard that points to them.
5. The MVP does not call the Superset REST API. Catalyst shows `Bundle ready`
   until the importer records CLI success, then `Imported`; it never infers
   `Synced` merely because a file exists.
6. Superset queries the same configured data source as the originating Catalyst
   Dataset. Bundles contain configuration and recorded identities rather than
   result rows. Credentials remain in deployment configuration and never enter
   the bundle.
7. Superset API publication, embedded viewing, cross-system undo/reconciliation,
   sharing, scheduling, cache policy, production naming/authorization, and
   production secrets remain later decisions.

Open `docs/specs/staff-workbench-ux/index.html` through a static HTTP server
to browse the approved mock and its light/dark states.
Where the detailed design below says API write, sync, push, or undo, implement
the outbox/import semantics above for this milestone.

# Detailed design

## Overview

Catalyst turns a natural-language question into reviewable SQL, sends the exact
selected query to the configured connection, and returns typed rows or its
database error. This design extends that into a full path:

**ask → dataset → widget → dashboard**

Catalyst is the *builder* and desired-configuration source for this one-way MVP.
**Superset is the renderer**: Catalyst publishes datasets, charts, and dashboard
configuration as a native ZIP to the shared outbox, and the pinned CLI imports
it. Filtering and viewing happen in Superset; Catalyst never re-implements the
chart runtime. API-backed collaboration and Superset-to-Catalyst reconciliation
remain post-MVP.

Repo this extends: `DIGI-UW/openelis-catalyst` (branch `main`), app at `catalyst-ui/`.

## Implementation and fidelity

Implement the written behavior and approved staff Workbench appearance in
`catalyst-ui` with its existing React, TypeScript, Carbon, and CodeMirror
components. Reuse Carbon controls and semantic tokens; preview HTML and
illustrative state are not production implementation. The current running
product and tests establish the behavior to preserve while applying this design.

## Product model

Four object types, mapped onto Superset primitives:

| Catalyst object | Lives in | Superset counterpart | Notes |
| --- | --- | --- | --- |
| Session / thread | Catalyst | — | question, generated SQL, drafts, provenance trace |
| **Dataset** | Catalyst + Superset | imported virtual-dataset YAML over the exact saved SQL | one immutable Dataset version can back many Widget versions |
| **Widget** | Catalyst + Superset | imported chart YAML | stores compatible viz type + deterministic column bindings |
| **Dashboard** | Catalyst draft + Superset runtime | imported dashboard YAML | Catalyst publishes desired layout; Superset-only edits are replaced on republish in this MVP |

**Ordering constraint that drives the UI:** Superset cannot import a chart
without its dataset asset. Dataset save is strictly upstream of Widget save, and
the published ZIP orders database → dataset → chart → dashboard. Saving a Widget
may first save its Dataset version as one Catalyst operation; no Superset write
occurs until publication.

### MVP visualization set

Deliberately small, chosen for laboratory/health surveillance data:

1. **Table** — typed, as today. Default when the shape is not obviously chartable.
2. **Big number (KPI)** with optional trend vs. previous period.
3. **Time-series line/area** — the default whenever a date/time column plus a measure is present.
4. **Bar** — categorical comparison, grouped or stacked.
5. **Proportion bar** — 100% stacked single bar for composition (e.g. rejection reasons).

Pie/donut is intentionally excluded: proportions read more accurately as a stacked bar, and the demo data is mostly time series and categorical counts. Map and pivot table are explicit post-MVP.

### Chart suggestion rule

The MVP deterministically suggests one viz type from the typed result shape. The
user can override the compatible type with one compact control in the Widget
review panel; arbitrary column remapping and model-generated visualization
specifications remain deferred. Suggested precedence:

- 1 date/timestamp column + ≥1 numeric measure → **line** (split by a low-cardinality category if one exists, ≤ 6 distinct values)
- 0 date columns + 1 category + 1 measure → **bar**
- single row, single measure → **KPI**
- 1 category + 1 measure where measure sums to a meaningful whole → **proportion bar**
- anything else, or > 6 columns → **table**

The suggestion is presented as prose in the assistant bubble ("One date column,
one count, one category. I'd show this as a **monthly trend line, split by test
type**."). The panel shows the derived bindings read-only and one compatible-type
selector. There is no arbitrary column-mapping panel in the MVP; changing query
shape remains a normal query follow-up.

### Query parameters → dashboard filters

Generated SQL may contain named parameters (`:since_date`, `:facility`). The dataset panel lists them read-only in the MVP. Post-MVP: promote a parameter to a Superset native filter at placement time. Do not build the filter-mapping table in the MVP.

## Screens / Views

The app uses one horizontal shell across Explore and Saved work. Saved work
contains the three object libraries.

### Shell

**Demo banner** (fixed, top, full width, `z-index: 120`)
- Height `2.5rem` min, background `#262626`, text `#f4f4f4`, bottom border `1px solid #8d8d8d`, padding `0.5rem 1.5rem`, gap `0.75rem`, font-size `0.875rem`.
- Carbon warning-circle icon 20×20, then a pill: height `1.125rem`, radius `0.5625rem`, background `#e5e0df`, color `#171414`, font-size `0.75rem`, text "Demo environment".
- Body copy: "Demo data only; not for clinical decision-making."
- Right-aligned session meta, color `#c6c6c6`, font-size `0.75rem`: "Session 7f2a91c4 · 3 turns" (or "No active session" when the thread is empty). This is status text, never a second New session action.
- This is the existing `DemoBanner` component, restyled to a full-width fixed bar.

**Primary navigation**
- Use a neutral horizontal header with visible **Explore** and **Saved work**
  destinations. A thin violet underline identifies the active destination; text
  remains neutral in light mode and off-white in dark mode.
- Saved work reveals Saved queries, Charts and tables, and Dashboards. Counts
  update as objects are saved. Do not show a permanent development-style side
  rail or icon-only destinations.
- The selected source stays visible in Explore. Changing it starts a new session
  through the existing confirmation behavior.
- Place **View options** at the quiet end of the header. It contains Appearance
  and Advanced mode and shows a small Advanced indicator while enabled. Query
  settings stays directly accessible beside the composer.

**Content column**: center the writing experience with comfortable readable
measure, then let SQL, results, schema, and Dashboard layouts use the available
width. Use `1.5rem` inline gutters. On Workbench, bottom padding equals the
measured composer height plus one spacing unit; use `4rem` elsewhere. There is
no navigation offset.

**Page header pattern** (all screens): eyebrow `0.75rem`/600 in the secondary
text role, `letter-spacing: 0.08em`, uppercase; H1 `2rem`/400,
`letter-spacing: -0.025em`, `line-height: 1.15`; description `0.875rem` in the
secondary text role, `line-height: 1.5`. Primary action, when present, sits
top-right.

### 1. Workbench — populated thread

Purpose: ask a question, review what came back, save it.

Behavioral override: retain the accepted production query workflow and controls
through Dataset save. The thread wraps that workflow; it does not collapse SQL
generation, editing, versioning, validation, explicit execution, diagnostics,
results, and follow-up into a single automatic prompt action. The executed-result
preview opens from the Dataset tile in the review panel, while the one canonical
SQL editor remains the active query work surface.

Thread is a single `flex-direction: column; gap: 1rem` stack, full content width.

- **Header**: eyebrow "Explore", H1 = the session title ("Monthly viral load,
  2026"), description "Nothing is saved until you review it. Drafts stay in
  this thread." Top-right: "New session" secondary button.
- **User message**: `align-self: flex-end`, `max-width: 38rem`, padding `0.75rem 1rem`, background `#e0e0e0`, color `#161616`, `0.875rem`/1.5. No radius (Carbon is square).
- **Latest query workbench card**: immediately after the latest user instruction
  and before any Dataset tile, integrate the current production workbench. It is
  the only editable SQL surface and retains the current CodeMirror completion,
  formatting and wrapping controls; typed parameter editor; advisory validation;
  explicit Run; raw generation evidence; findings; database diagnostics; typed
  result status; provenance/version history; and Clear/Restore. New session
  remains only in the Ask page header. Use
  the thread's full content width and Carbon tile styling. After a successful Run,
  for the exact visible editor digest, the one Dataset tile immediately following
  this card is the entry point to the typed rows; do not retain a second inline
  result table. If the buffer changes, keep the previous tile visible but mark it
  stale. Earlier turns
  collapse to read-only question/query/version/execution summaries. When a
  successor becomes current, this same card moves with the latest turn rather
  than creating another editor.
  Its editable control is labelled exactly `SQL query`; completion, formatting,
  and wrapping help is linked with `aria-describedby` rather than included in
  the accessible name.
- **Available data companion**: “What data is available?” opens the existing
  complete source browser beside the draft. Search matches relation names,
  optional descriptions, column names, and exact identifiers. Preserve its
  runtime relation/column list, exact types, source filters, pagination, and
  no-match/loading/empty/unavailable/retry feedback. Opening, searching, and
  closing preserves the draft, selection, composer size, expanded relations,
  scroll, and focus return. It never retrieves clinical rows while drafting.
  On narrow screens it becomes a full-height sheet over the same retained state.
- **Draft tile — dataset** (the key component). A button, `width: 100%`, `max-width: 34rem`, `display: flex; align-items: center; gap: 1rem`, padding `0.75rem 1rem`, background `#fff`, border `1px solid #c6c6c6`, `border-left: 3px solid` state accent. Contents left → right:
  - 20×20 Carbon "data-table" icon, `#525252`
  - stacked text (`flex: 1`): name `0.875rem`/600; meta line `0.75rem` `#6f6f6f` — "Dataset · 250 shown · more available · total unknown · 4 typed columns · Query v3" for a truncated result without an exact total
  - status pill: height `1.5rem`, radius `0.75rem`, `0.75rem` text. Draft = background `#fcf4d6` / color `#684e00`. Saved = background `#defbe6` / color `#0e6027`.
  - "Review" affordance, `#0f62fe`, `0.875rem`
  - Hover: `border-color: #0f62fe`, `background: #f4f4f4`. Left accent: `#0f62fe` while draft, `#24a148` once saved.
  - Whole tile is the click target; it opens the review panel. No data table and no chart render inline — detail lives in the panel only.
- **Assistant suggestion**: `max-width: 44rem`, padding `1rem 1.25rem`, a
  restrained action-role left border, neutral surface background, `0.875rem`/1.5.
  Viz name in `<strong>`.
- **Draft tile — widget**: same geometry as the dataset tile; thumbnail is a 52×24 two-series sparkline (`#0f62fe` and `#a56eff`, `stroke-width: 2`). Meta line: "Line chart · split by test_name", becoming "Line chart · on Lab operations" after placement. Left accent `#8a3ffc` while draft, `#24a148` once saved.

**Composer** (bottom Workbench surface, `z-index: 90`)
- Reserve the measured full composer height in the thread so the latest result
  and focused controls remain reachable. Keep it at the bottom for ordinary
  viewports and use page flow on very short screens.
- In a populated session, the visible label is `Ask a follow-up`; helper text
  identifies the earlier question and exact selected query, says `Using your
  edited query` when applicable, and retains provenance in technical details.
  In an empty session use `Your question`; use `Your answer` for clarification.
- Start at three comfortable lines. Allow native vertical resizing with a
  minimum around `72px`, maximum `40vh`, and desktop cap of `360px`; lower the
  cap on narrow screens. Provide explicit keyboard-operable Expand and Restore.
  Preserve entered text, selection, focus, and the visit's chosen size across
  preparation, failure, retry, and Workbench state changes.
- The footer contains a quiet Query settings control, the configured-source
  execution note, Expand/Restore, and primary `Continue`. Query settings shows
  only available profiles; exact profile/model identities remain available in
  technical details and Advanced mode.
- `Continue` prepares a complete candidate and never executes SQL. The later
  explicit action is `Get results`. `Cmd/Ctrl+Enter` invokes Continue; Enter
  inserts a newline. Empty input disables Continue. Prevent duplicate requests,
  announce progress and failures, retain the draft on failure, and offer Retry.
- The composer reflows at 320, 390, and 640 CSS pixels without covering focused
  content. It does not automatically collapse or tuck when the page scrolls.
- Composer is present on Workbench only.

### 2. Workbench — first run / empty thread

Same shell and composer, no thread.
- H1 "What would you like to find out?"; description "Ask in plain language. Catalyst
  prepares editable SQL; you review, validate, and explicitly run it read-only."
- Omit the prototype's three example-prompt buttons. They would bias manual
  evaluation and are not part of the accepted Ask experience.
- Footnote `0.75rem` `#6f6f6f`: "Queries run against the selected source only when you select Run. You review the SQL before anything is saved."
- No "New session" button in this state.

### 3. Datasets library

Purpose: find and reuse a saved governed query.

- Header: eyebrow "Library", H1 "Datasets", description "Saved governed queries, ready for dashboard publication. One dataset can back many widgets." Primary button top-right: "New from question" (add-16 icon) → navigates to Workbench.
- Carbon `DataTable` on a `#fff` surface with `box-shadow: 0 0.125rem 0.5rem rgb(0 0 0 / 8%)`. Header row background `#e8e8e8`, cells padding `0.75rem 1rem`, `0.875rem`, row separators `1px solid #e0e0e0`, zebra `#fff` / `#f4f4f4`.
- Columns: Name (weight 500) · Source · Columns · Widgets · Parameters (IBM Plex Mono `0.75rem` `#525252`) · Last run (`#525252`) · Status pill · row action "Review" (ghost button, `#0f62fe`, right-aligned).
- **Widgets count is the governance affordance** — it shows downstream use so nothing is deleted blind.
- Seed rows: "Turnaround time by test type" (OpenELIS · 6 · 2 · `:since_date` · Jul 12, 09:14 · Saved); "Rejected specimens by reason" (OpenELIS · 4 · 1 · — · Jul 10, 16:02 · Saved); "CD4 cohort, under 200" (OpenMRS · 5 · 0 · `:facility` · Jul 8, 11:47 · Draft). A dataset saved during the session appears at the top.
- Row "Review" opens the same dataset panel used in the thread.

### 4. Widgets library

Purpose: reuse a chart config on another dashboard.

- Header: eyebrow "Library", H1 "Widgets", description "Saved chart configurations. A widget can sit on more than one dashboard."
- `display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr))`.
- Card: background `#fff`, `box-shadow: 0 0.125rem 0.5rem rgb(0 0 0 / 8%)`, no radius.
  - Thumbnail band: height `7rem`, padding `1rem`, background `#f4f4f4`, `border-bottom: 1px solid #e0e0e0`, contents centered. One thumbnail per viz type: line = two polylines (`#0f62fe`, `#a56eff`); KPI = value `2rem`/600 plus trend line `0.75rem` `#0e6027`; bar = five `#0f62fe` rects; table = four stacked bars (`#8d8d8d` header, `#c6c6c6` rows); proportion = one 2.5rem-tall row split `#0f62fe` / `#78a9ff` / `#c6c6c6`.
  - Body: padding `1rem`, `gap: 0.375rem` — name `0.875rem`/600; "<type> · <dataset>" `0.75rem` `#6f6f6f`; placement `0.75rem` `#525252` ("On Lab operations", "On Lab operations · HIV/ART program", or "Not placed"); then an "Add to dashboard" ghost button (height `2rem`, `1px solid #0f62fe`).
- Seed cards: "Median turnaround, 30 days" (Big number, `212m`, "↓ 8% vs previous 30 days"); "Results by test type" (Bar); "Rejection reasons" (Proportion bar); "Pending results, current" (Table). A widget saved during the session appears first.

### 5. Dashboards

Purpose: see what exists, which bundle is ready/imported, and jump to Superset.

- Header: eyebrow "Library", H1 "Dashboards", description "Catalyst publishes the desired configuration; Superset imports and renders it."
- Rows stacked `gap: 1rem`. Each row: `display: flex; gap: 1.5rem`, padding `1.25rem 1.5rem`, background `#fff`, `box-shadow: 0 0.125rem 0.5rem rgb(0 0 0 / 8%)`, `border-left: 3px solid` — `#f1c21b` when a bundle is pending import, `#24a148` when the exact digest is Imported.
  - **Layout mirror** (left, `width: 9rem`): `display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1.5rem; gap: 0.25rem`; tiles span 1–3 columns. A newly added widget is `#0f62fe`; existing widgets `#c6c6c6`; empty space `#e0e0e0`. Read-only — it is a wayfinding hint, not an editor.
  - Middle: name `1rem`/600; meta `0.875rem` `#525252` ("6 widgets · 3 datasets"); publication line `0.75rem` — `#8e6a00` "Bundle ready — import pending", `#0e6027` "Imported · Jul 15, 14:02", or the explicit failed-import state.
  - Right: "Publish to Superset" primary button above "Download bundle" and an "Open Superset" ghost link with launch-16 icon, all height `2.5rem`.
- Seed rows: "Lab operations" (Bundle ready) and "HIV/ART program" (Imported Jul 12, 09:20).

### 6. Review panel (slide-over)

One panel component, two modes. Opened by any draft tile or library row; this is **the only place saves happen**.

- Scrim: fixed below the header, `left: 0`, `right: 0`, `bottom: 0`, background `rgb(22 22 22 / 40%)`, `z-index: 130`; click closes.
- Panel: fixed right, `top: 2.5rem`, `bottom: 0`, `width: min(32rem, calc(100vw - 4rem))`, background `#fff`, `border-left: 1px solid #e0e0e0`, `box-shadow: -0.25rem 0 1rem rgb(0 0 0 / 18%)`, `z-index: 140`, `display: flex; flex-direction: column`.
- Underlying page gets `filter: blur(1.5px)` (`transition: filter 120ms`) — cheap depth cue; drop it if it costs paint performance.
- **Header**: padding `1.25rem 1.5rem`, `border-bottom: 1px solid #e0e0e0`. Kicker `0.75rem` `#6f6f6f` uppercase `letter-spacing: 0.08em` ("Dataset" / "Widget"); title `1.25rem`/400 `letter-spacing: -0.025em` ("Review dataset" / "Review widget"); 2.5rem close icon button (close-20), hover `#e8e8e8`.
- **Body**: `flex: 1; overflow-y: auto`, padding `1.5rem`, sections `gap: 1.5rem`.
- **Footer**: padding `1rem 1.5rem`, `border-top: 1px solid #e0e0e0`, background `#f4f4f4`; primary save + "Close" ghost, `gap: 0.75rem`, both height `2.5rem`.

**Dataset mode body**
1. Name text input (label `0.75rem` `#525252`; Carbon underline field: `background: #f4f4f4`, `border-bottom: 1px solid #8d8d8d`, `min-height: 2.5rem`).
2. Metadata grid, 2 columns, `gap: 1px` on a `#e0e0e0` background so hairlines show; each cell padding `0.75rem 1rem`, background `#f4f4f4`; `dt` `0.75rem` `#6f6f6f`, `dd` `1rem`. Include bounded rows (`250 shown · total unknown` when truncated without an exact total), columns, exact `Query vN`, source, typed parameters, and truncation state.
3. Always-visible plain-language warnings, limits, and database diagnostic,
   including an explicit `None` after a successful run. A named **Technical
   details** disclosure contains exact-digest findings and profile/model/trace/
   catalog provenance. Advanced mode opens it by default; simple mode keeps it
   directly reachable. Required failures and limits remain visible outside it.
4. Full bounded typed-result table, `0.75rem`, `1px solid #e0e0e0`, with the
   same header/zebra treatment as the libraries. Show each column's declared
   type, `showing X–Y of N` for the bounded payload, paging controls,
   null/empty-cell rendering, empty-result feedback, value warnings, and the
   execution-limit/truncation notice. When truncated and no exact total was
   returned, use `N shown; more available; total unknown`; never infer a total
   from the query or preview. This panel is the only row-table rendering for the
   active result; it is not a three-row teaser.
5. Collapsed accordion `Query vN SQL snapshot` (Carbon accordion; chevron rotates 90°, `transition: transform 110ms`). Expanded: `<pre>` IBM Plex Mono `0.75rem`/1.6 on `#f4f4f4`, padding `1rem`. The visible warnings and named Technical details disclosure above remain authoritative for limitations and provenance.
   - **Governance decision:** this is a read-only snapshot of the exact executed
     Query vN and provenance. Editing remains in the latest turn's single
     canonical SQL editor. Saving the Dataset is explicit; later query changes
     mark the draft stale rather than mutating or silently rebinding it.
6. Footer: "Save dataset" → "Saved to library" (disabled) once saved.

**Widget mode body**
1. Schematic preview, padding `1rem`, `1px solid #e0e0e0`: preserve the mock's
   420×150 geometry as a lightweight type thumbnail, not a Catalyst chart
   renderer. Authoritative data rendering happens in Superset after import.
2. Widget name input plus one compact compatible-visualization selector.
   Derived bindings and incompatibility reasons are read-only. The saved Dataset
   SQL owns report calculations; selecting a chart never asks the user to repeat
   an aggregation or changes that SQL.
3. "Reads" block: label `0.75rem` `#525252`, then a `#f4f4f4` row (padding `0.75rem 1rem`) with dataset name and its Draft/Saved pill. When the dataset is unsaved, a `0.75rem` `#8e6a00` note: "Saving the widget saves this dataset too — publication includes the dataset before the chart."
4. "Add to dashboard" Select: "Lab operations" · "HIV/ART program" · "Don't place it yet".
5. Footer button label is derived: "Save widget and add" when a dashboard is chosen, "Save widget" when "Don't place it yet", "Saved" (disabled) after.

### 7. Success toast

Fixed, `right: 1.5rem`, `bottom: 11rem`, `z-index: 150`, `max-width: 24rem`, padding `1rem`, background `#fff`, `border-left: 3px solid #24a148`, `box-shadow: 0 0.125rem 0.5rem rgb(0 0 0 / 20%)`, `role="status"`. Checkmark-filled-20 `#24a148`. Message `0.875rem`/1.5, then a `0.375rem` gap and context-appropriate links such as "Download bundle" · "Open Superset". Auto-dismiss after 6s.

Messages:
- `"<dataset name>" saved to Datasets.`
- `"<widget name>" saved and added to <dashboard name>.`
- `"<widget name>" saved to Widgets. Not placed on a dashboard.`
- `<dashboard name> bundle is ready for Superset import.`

Use Carbon `ToastNotification` if it can be positioned this way; otherwise match the geometry above.

## Interactions & Behavior

**Navigation**
- Explore or Saved work selection changes the visible destination and closes any
  open panel. Saved work retains the current library subdestination.
- View options changes Appearance or the workspace-wide Advanced presentation
  without changing the active destination or any draft/query/result state.
- "New from question" (Datasets) → Workbench. The single page-header "New session"
  action clears the active thread and composer after the existing confirmation
  semantics. Neither the banner, workbench, nor composer provides another New
  session action.

**Draft tile → panel**
- Click anywhere on a tile opens the panel in the matching mode. Panel closes on: close button, "Close", or scrim click. Add `Escape` to close and return focus to the invoking tile (a11y requirement not visible in the prototype).

**Saving**
- *Save dataset*: append an immutable Catalyst Dataset version, mark it Saved, close the panel, and toast. Dataset tile accent `#0f62fe` → `#24a148`; pill Draft → Saved; nav Datasets count +1.
- *Save widget*: if its dataset is unsaved, save its Dataset version first; if a dashboard was chosen, append the Widget version to that Dashboard draft. Mark both Saved, close panel, toast. Nav Widgets count +1; widget meta line becomes "Line chart · on <dashboard>"; the dashboard row shows a pending bundle and its layout mirror shows the new tile in `#0f62fe`.
- Save buttons are single-shot: disabled and relabeled after success. Local unsaved changes may be discarded before publication; cross-system Undo after import is deferred.
- *Publish to Superset* (Dashboards): writes/downloads the atomic outbox ZIP and flips the row to `Bundle ready`. Only an exact CLI receipt may later show `Imported` or `Import failed`.

**Not in the MVP** (all considered and cut, in this order of likely reintroduction): arbitrary column-mapping panel, model-generated/"why this suggestion" reasoning, full Catalyst chart rendering, size/slot picker, parameter → native-filter mapping, config diff before write, embedded Superset viewing, dashboard rename/delete/share from Catalyst.

**Loading / error states** (the prototype shows representative generation evidence; production implements every state):
- Question/follow-up in flight: skeleton latest-turn workbench state; composer
  generation action disabled with an inline spinner. No Dataset tile exists before a
  successful explicit Run.
- SQL generation failure: inline notification in the thread with the failure reason, raw candidate evidence when available, and a retry action; keep the prior query current and editable.
- Query execution error: the active workbench retains the editable SQL and shows
  the database diagnostic; do not create a Dataset tile for a failed execution.
- Bundle generation failure: drafts stay Saved, no current pointer changes, and an inline notification exposes the bounded diagnostic and retry action.
- Superset CLI import failure: Superset remains available, the prior imported dashboard remains usable, and the exact bundle shows `Import failed` with retry/reset guidance.
- Superset render check pending: schematic thumbnail remains visible while the
  dashboard row reports `Bundle ready`; the authoritative preview is available
  only after a successful import receipt.

**Responsive** — the working surface supports desktop and narrow layouts. Below
672px (Carbon's `md`), review and Available data companions become full-height
sheets. Tiles, cards, the header, composer, results, and controls wrap without
hiding actions at 640, 390, and 320 CSS pixels.

**Motion** — disclosure chevrons use 110ms; page blur uses 120ms. Panel entry is
a 240ms ease-out slide from the right. Respect `prefers-reduced-motion` by
dropping the blur and slide.

## State Management

Session-scoped state (prototype names in parentheses):

| State | Type | Purpose / transitions |
| --- | --- | --- |
| `screen` | "Workbench" \| "Datasets" \| "Widgets" \| "Dashboards" | domain route behind Explore and Saved work; selection also closes the panel |
| `savedWorkView` | "Datasets" \| "Widgets" \| "Dashboards" | retained Saved work subdestination |
| `advancedMode` | boolean | visit-scoped presentation preference; changes disclosure defaults only |
| `thread` | boolean (prototype) / message array (production) | empty vs. populated Ask screen |
| `currentVersion` + `editorSnapshot` | immutable version reference + exact mutable SQL/typed-parameter buffer | drives the latest turn's single active workbench card; dirty/unresolved state is never duplicated in a Dataset draft |
| `validation` + `execution` | exact-digest findings and latest execution summary/typed result reference | drives advisory state, explicit Run, result staleness, and eligibility for a Dataset tile |
| `catalogOpen` + runtime catalog projection | boolean + server response | nonmodal Available data companion backed by the complete runtime relations/columns, filters, paging, and status; never fetches rows |
| `evidenceOpen` | boolean | exposes raw candidate/failure evidence, findings, and database diagnostics without creating a second editor |
| `panel` | null \| "dataset" \| "widget" | which slide-over mode is open |
| `sqlOpen` | boolean | SQL/provenance accordion |
| `dsSaved`, `wSaved` | boolean (prototype) / immutable Catalyst version ids (implementation) | Draft vs. Saved for the current drafts |
| `dsName`, `wName` | string | editable names, deterministically prefilled from question/result metadata |
| `dashboard` | "lab" \| "hiv" \| "none" | placement choice |
| `prompt` + `composerHeight` | string + number | composer value and visit-retained user-selected size |
| `toast` | null \| string | transient confirmation, 6s timer |
| `labPending` | boolean | per-dashboard bundle-ready flag |

In implementation, replace the booleans with server-owned entities: a session/thread resource holding messages and draft objects plus immutable Dataset, Widget, Dashboard, and Bundle Export versions. Stable logical Dashboard UUIDs and version-derived child UUIDs are export provenance; drafts persist server-side so reload does not lose work.

**Data fetching**
- Existing question/turn/version/Validate/Run routes and semantics remain the
  behavioral contract. A question or follow-up produces a complete query for
  manual review in the one canonical editor; execution is always explicit.
- Explicit execution through the configured connection returns typed rows or a
  database diagnostic; these feed
  tile metadata, the movable panel preview, and the shape-based viz suggestion.
- Publish: Gateway serializes database → virtual dataset → chart → dashboard YAML plus the Catalyst manifest, writes the content-addressed ZIP and `current.json` atomically to the outbox, and offers the same ZIP for download.
- Import: a one-shot Compose service runs the pinned Superset CLI, reads the outbox read-only, and writes a digest-addressed receipt. It is invoked during clean bootstrap or by the explicit running-instance helper; Catalyst never accesses the Docker socket.
- Libraries read from Catalyst's own records and import receipts, so they render without querying Superset on every page view.

## Design Tokens

Use Carbon semantic tokens for neutral light and charcoal dark appearances.
Violet is reserved for primary actions, focus, and the small OpenClinAI mark;
body, navigation, disclosure, and link text stays neutral or off-white. The hex
values below document reference roles for visual comparison and must be mapped
to the existing theme system instead of copied into components.
Earlier blue literals in component geometry mean the current semantic action or
focus role; they do not override this palette.

**Color**
| Value | Carbon token | Used for |
| --- | --- | --- |
| `#161616` | gray-100 / `$text-primary` | body text, headings |
| `#262626` | gray-90 | demo banner background |
| `#393939` | gray-80 | secondary button |
| `#525252` | gray-70 / `$text-secondary` | descriptions, inactive nav |
| `#6f6f6f` | gray-60 / `$text-helper` | meta, labels |
| `#8d8d8d` | gray-50 | field borders, axes |
| `#c6c6c6` | gray-40 | tile borders, disabled, chart neutral |
| `#e0e0e0` | gray-30 | dividers, user bubble, empty layout tile |
| `#e8e8e8` | gray-20 / `$layer-hover` | table headers, hover, active nav |
| `#f4f4f4` | gray-10 / `$layer` | app background, fields, zebra |
| `#ffffff` | white / `$layer-01` | surfaces |
| `#7540d0` / `#8b4cf0` | violet action roles | primary action in light / dark, white label |
| `#6d35c3` / `#eeeef0` | link/disclosure roles | links in light / dark |
| `#252329` / `#eeeef0` | text roles | primary text in light / dark |
| `#fafafa` / `#19191c` | background roles | page in light / dark |
| `#ffffff` / `#222225` | surface roles | cards and panels in light / dark |
| `#bb99ff` | focus role | dark appearance focus |
| `#78a9ff` | blue-40 | proportion segment 2 |
| `#4b2e83` / `#f2c75c` | brand detail roles | small OpenClinAI mark / tiny gold detail |
| `#24a148` / `#defbe6` / `#0e6027` | green-50 / green-10 / green-70 | saved state, success |
| `#f1c21b` / `#fcf4d6` / `#684e00` | yellow-30 / yellow-10 / yellow-70 | draft state, pending accent |
| `#8e6a00` | — | inline warning text |
| `#e5e0df` / `#171414` | warm gray | demo pill (existing app) |

**Type** — IBM Plex Sans (400/500/600) and IBM Plex Mono (400) for SQL, parameters, and identifiers.
| Size | Use |
| --- | --- |
| `2rem` / 400 / `-0.025em` / 1.15 | page H1 |
| `1.25rem` / 400 / `-0.025em` | panel title |
| `1rem` / 600 | object names, KPI-adjacent |
| `1rem` / 400 / 1.5 | composer input |
| `0.875rem` / 400–600 / 1.5 | body, tiles, tables, buttons |
| `0.75rem` / 400–600 | meta, labels, pills, eyebrows (`0.08em`, uppercase) |
| `2rem` / 600 / `-0.02em` | KPI value |

**Spacing** — Carbon scale: `0.125 / 0.25 / 0.375 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 / 3rem`. Cards and tiles use `1rem`–`1.5rem` padding; stacks use `gap: 1rem`; grids `gap: 1rem`.

**Radius** — 0 everywhere except status pills (`0.75rem`, i.e. fully round at `1.5rem` height) and the demo pill (`0.5625rem`).

**Shadow** — surfaces `0 0.125rem 0.5rem rgb(0 0 0 / 8%)`; composer `0 -0.25rem 1rem rgb(0 0 0 / 18%)`; panel `-0.25rem 0 1rem rgb(0 0 0 / 18%)`; toast `0 0.125rem 0.5rem rgb(0 0 0 / 20%)`.

**Borders** — use semantic hairline, interactive, field, and state roles. The
composer is a writing surface rather than a branded four-pixel bar. Violet focus
uses the theme focus role; gold is never a general border or focus color.

**Z-index** — banner 120 · header 100 · composer 90 · scrim 130 · panel 140 · toast 150.

## Assets

No image assets. All icons are inline SVG on Carbon's 32×32 grid, drawn from `@carbon/icons-react`: WarningFilled, ChevronLeft, ChevronRight, Chat, DataTable, ChartLine (nav "Widgets" uses a chart glyph), Dashboard, Add, ArrowRight, Close, CheckmarkFilled, Launch. Replace the inline paths with the real icon components. Charts and thumbnails are hand-drawn SVG placeholders standing in for the production chart renderer.

Fonts: IBM Plex Sans and IBM Plex Mono, loaded from Google Fonts in the prototype — use the app's existing `@ibm/plex` dependency instead.

## Prototype retirement

The owner requested removal of obsolete previews on 10 September 2026 after the
older Dashboard template was mistakenly published instead of the approved mock.
The three `.dc.html` pages, their `support.js` runtime, and their dedicated server
script are removed from the current tree. Git history retains the prior files;
none remains an implementation authority or a public preview destination.

| Retired material | Requirement disposition |
| --- | --- |
| Populated Dashboard Builder 4c page | Query chronology, exact-query execution, stale results, Dataset/Widget tiles, and review are covered by MVP interaction contract and Screens 1 and 6. |
| 4c libraries and save flow | Dataset → Widget → Dashboard ownership and immutable versions remain in Product model, Screens 3–6, Saving, and State Management. Saving a Widget can save its Dataset first and may leave placement unset. |
| 4c Dashboard and publication states | Dashboard layout summary, multiple Widgets, publication order, bundle-ready/imported/failure states, receipts, and Superset rendering remain in the final MVP decisions, Screen 5, and Data fetching. No demonstrated mock action is live evidence. |
| 4c panel and feedback | Reusable review modes, exact result table, types, limits, SQL snapshot, provenance, close/Escape/focus behavior, and save confirmations remain in Screen 6 and Interactions & Behavior. |
| Older shell, colors, fixed composer, and default technical detail | Superseded by the approved staff Workbench appearance, resizable composer, Available data, and Advanced-mode requirements in this document. |
| Query Screen snapshot | The actual product and its behavioral tests cover the SQL editor, Format/Validate/Run, parameters, history, failures, and restoration. The snapshot adds no current requirement. |
| Alternative wireframes and preview runtime | Discarded design alternatives and preview-only machinery; no current product requirement. |

The approved visual reference is `docs/specs/staff-workbench-ux/index.html` with
its sibling `mock.html`, `mock.css`, `mock.js`, `appearance.css`, and
`appearance.js`. Publish the complete bundle and compare rendered screenshots
against the approved preview; a file hash or HTTP 200 alone does not verify
that the correct design was selected or that it renders.

## Open questions for the team

1. **Superset-only edits** — one-way MVP publication replaces direct layout edits; bidirectional export/reconciliation remains an API-phase decision.
2. **Orphan cleanup** — version-derived children accumulate by design; the MVP uses an explicit local reset, while selective cleanup is deferred.
3. **Dataset naming collisions** — deterministic version-addressed names avoid collisions in the MVP; production-friendly display/retention policy remains open.
4. **Who can publish** — the unauthenticated local demo shows the action unconditionally; role-gating belongs to production authorization.
5. **Refresh cadence** — the local MVP uses Superset defaults; explicit cache policy remains a later operational decision.

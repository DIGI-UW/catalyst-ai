# Catalyst workbench usability design

**Status:** Proposed design supplement for review; not runtime implementation or
final product acceptance. Existing product contracts remain authoritative until
the owner adopts the changes identified here.

**Audience:** clinical and program staff without SQL knowledge first; analysts
second. The owner's immediate need is a resizable question-writing area at the
bottom of the screen.

- [Interactive mock](index.html)
- [Overlap and ownership review](overlap.md)
- [Research and QA](research-and-qa.md)
- [Current product specification](../../specification.md)
- [Binding Dashboard Builder design](../../dashboard-builder-mvp-design.md)

## Intended experience

A person understands the active source, writes a question comfortably, reviews
and explicitly runs the prepared query, inspects the result and limitations,
and saves it for reuse. Analyst tools remain easy to find without requiring
staff to understand schema identifiers, model configuration, or traces first.

Use existing React, Carbon, and CodeMirror components. This proposal adds no
query engine, model behavior, schema filter, or publication path.

## One question composer

Share the presentation used by `QuestionForm` and the `TurnNotebook` follow-up
form. Keep their distinct request handlers and existing state ownership.

| Element | Specified behavior |
| --- | --- |
| Label | Visible “Your question” initially, “Ask a follow-up” after a turn, or “Your answer” for clarification. Placeholder text is only a hint. |
| Context | Initially show the source. For follow-up, identify the earlier question and selected query. If the editor has changes, say “Using your edited query” and retain the exact snapshot. |
| Sizing | Start at three comfortable lines. Allow native vertical resizing, with a minimum around 72 px and a field maximum initially 40% of viewport height, capped at 360 px on desktop, with a lower cap on narrow screens to keep results and actions reachable. These are layout starting values, not limits on question length. |
| Expand / Restore | Explicit button expands the field; Restore returns to the prior size. Both work by keyboard and pointer. Preserve entered text and selection. |
| Size retention | Keep the person's selected size while typing and preparing queries, for the active visit. Do not overwrite it on every keystroke or add a server-side preferences subsystem. |
| Placement | Stay at the bottom of Workbench. Measure the whole composer and reserve that space in the thread. Focused controls and the last result must remain reachable. Use page flow on very short screens if needed. |
| Submit | “Continue” prepares a candidate without running it. The next screen uses “Get results” for explicit execution. Ctrl/Command + Enter invokes the same action; plain Enter inserts a newline. Empty input cannot submit. |
| Busy / error | Prevent duplicate requests, show real progress, retain the question after failure, and provide Retry with an accessible error announcement. |

Scrolling does not automatically shrink the proposed composer to a thin edge.
Explicit Expand/Restore replaces current full/line/tucked behavior. This is a
deliberate interaction amendment, so update that behavior's tests if adopted.
A workspace splitter is unnecessary for this field-level requirement.

## Screen hierarchy and language

The first screen leads with “What do you want to know?”, the selected source,
a brief explanation of prepare/review/run, and the input. Move the raw schema
card grid into the complete data browser. Do not add example-prompt buttons.

Use two main navigation destinations: **Explore** and **Saved work**. Explore
maps to the existing Workbench. Saved work contains **Saved queries** (Datasets),
**Charts and tables** (Widgets), and **Dashboards**. These are interface labels
and grouping changes; the domain objects, APIs and save behavior keep their
existing identities. This explicitly amends the existing navigation presentation.

Remove the permanent development-style sidebar. Use a centered content column,
a comfortable writing card, readable type and restrained borders. The warm
neutral surface and green accent are proposed visual choices, not evidence of
better clinical outcomes. Reuse Carbon controls and theme tokens with small
application-level color aliases; do not introduce another design system.

“What data is available?” opens the existing searchable, filterable, paginated
browser with every readable table, view, column, and type. Descriptions can
accompany original names; the disclosure must not filter model context or
remove a human's access to any relation.

Place exact model names and profile configuration in **Query settings**. Keep
that control directly accessible beside the question field. AI-prepared output
is identified as such. The selected profile is explicit in the chooser and in
advanced view; it is not an always-visible model badge in the simple view. This
amends the binding visibility requirement without introducing automatic model
selection, substitution, or fallback.

### Complexity is disclosed, not removed

**Show advanced tools** opens the existing SQL and technical controls and keeps
them visible through query preparation, results, review, and library visits.
**Hide advanced tools** changes presentation only. Keep the setting for the
active visit; no role system, separate expert application, or server preference
service is needed. Individual controls remain reachable without enabling the
whole advanced view. Switching views must preserve drafts, parameters, selection,
query/execution identity, results, and focus.

| Capability | Simple view | Direct access / advanced view |
| --- | --- | --- |
| Question and source | Always visible | Same source/session and request state |
| SQL editing | View or edit SQL | Keep the single editor open, with Format, Wrap, Validate, Restore, Clear, parameters and history |
| Complete schema | What data is available? | The same searchable, paginated browser with all readable relations, columns and types |
| Model profile | Query settings | Explicit chooser and exact selected profile/model identities |
| Query/execution provenance | Technical details in result review | Keep exact SQL, parameters, dialect, schema, model configuration and traces open |
| Limitations and failures | Always visible when relevant | Same errors and warnings; never hidden by the view toggle |
| Save and visualization | View results, Save query; contextual Create chart or table | Full Dataset/Widget libraries, immutable versions, usage, compatibility, multiple Widgets and arrangement |
| Publication | Clear bundle/import state | Same-byte download, importer diagnostics, receipts and dashboard links |

No row, relation, capability, or evidence is discarded to make the screen look
simpler. Do not add a second SQL editor, duplicate workspace state, or change
backend requests based on this preference. The mock demonstrates disclosure; its
limited fixtures do not implement every capability in this inventory.

Use Carbon type, spacing, color, theme, and focus tokens. Aim for comfortable
16 px body/input text; reserve smaller type for secondary information and
monospace for SQL or exact identifiers. Preserve dark/system theme preferences;
the mock demonstrates the proposed light-theme hierarchy.

## Query, result, and failure states

| State | Presentation and behavior |
| --- | --- |
| Prepared | “Ready to get your results”, one “View or edit SQL” disclosure, and explicit “Get results”. Retain the single editor, formatting, wrapping, typed parameters, Validate, Clear/Restore, and history. No result exists yet. |
| Running | Show actual execution progress and prevent duplicate Run requests while preserving the selected SQL and parameters. |
| Success | “Your results are ready”, returned-row summary, selected source, and “View results”. Execution success is not proof that the answer is correct or clinically approved. |
| Limited | “Showing the first N rows. More are available; the total is unknown” when there is no exact total. Paging describes the bounded payload separately. |
| Empty | “No rows returned”, with source and query available. Offer refinement; do not mislabel an empty result as a service failure. |
| Stale | Keep the previous result inspectable with “Run the updated query to refresh these results”. A stale result cannot become a new current Dataset. |
| Database failure | Explain the failure, retain the native diagnostic and user input, and offer edit/retry. Do not create a successful Dataset draft. |
| Preparation failure | Explain that no new query was prepared. Preserve the question, previous query, and raw failure evidence; offer Retry. |
| Clarification / unsupported | Show the returned question or explanation. Execute no SQL and preserve the previous selected query. These are existing writer outcomes, not a new conversation capability. |

Keep SQL findings, execution outcome, recorded AI review, and human acceptance
separate. Unknown review status remains unknown. The design changes wording,
not validation decisions, approval status, or backend bookkeeping.

## Review, reuse, and publication

The **Dataset review panel owns the sole full result table**. The thread carries
its summary and review action. This follows the existing product spec,
DATASET-02, and harness delivery goal over conflicting inline-table descriptions
elsewhere in the design. Opening the panel must not duplicate the table.

Panel order:

1. Name, readable source label, returned-row summary and limitations.
2. Bounded typed table, paging, null/value warnings, and empty feedback.
3. Visible relevant SQL findings, database diagnostic and AI review status.
4. “Query and technical details”: exact executed SQL, typed parameters,
   version/execution identities, dialect, schema, model setup and trace links.
5. Save query / Close footer with an explicit saved state.

Opening the panel moves focus inside. Tab remains inside; Escape closes it and
returns focus to the invoker. If saving replaces that control, focus the saved
item's replacement or a named heading.

Empty libraries offer the next possible action. Charts and tables directs users to a
saved query, or back to their question if none exists. Dashboards directs
users to create/add charts and tables (Widgets). Disabled buttons do not explain prerequisites.

Preserve immutable saves, compatible visualization suggestions, downstream
usage, multiple same-source Widgets, and arrangement from the existing design.
Saving a Dataset retains its query/execution artifact; it does not promise that
later Superset views are frozen snapshots.

| Publication state | Meaning and action |
| --- | --- |
| Draft | Not yet published; offer Publish to Superset. |
| Waiting for import | The exact bundle is ready; offer the same-byte download and explain the existing importer step. |
| Imported | A receipt confirms the selected bundle; enable the stable Superset dashboard URL. |
| Import failed | Show the real error and recovery route. Do not enable a misleading Open action for the failed version. |

## Component reuse

| Surface | Implementation approach |
| --- | --- |
| Question input | Shared Carbon `TextArea`, `Button`, and `Select` presentation; existing request/state owners. |
| SQL | Existing CodeMirror editor and actions; change surrounding hierarchy and disclosure. |
| Feedback | Existing states with Carbon notifications/tags and common bounded-count wording. |
| Data and model details | Existing full browsers/panels, Carbon Accordion/Select where appropriate. |
| Review and libraries | Existing components and Carbon tables/forms; reorder content and repair focus. |
| Publish/import | Existing bundle and importer receipts; clear labels and recovery instructions. |

The offline mock uses semantic native controls and a small set of semantic style tokens without
new dependencies. It is a design reference, not production code to copy. The
implementation should reuse actual Carbon components and existing application
state, not the mock's fixture transitions.

## Acceptance and sequencing

The [overlap review](overlap.md) assigns existing requirements to their current
owners. Keep the work in the existing Catalyst UI effort and Feature 008 plan;
do not create another roadmap or change the program phases.

For the eventual implementation:

- Check initial and follow-up inputs with an eight-line question,
  drag/Expand/Restore, no text loss, submit shortcut, and failure recovery.
- Verify desktop, 390, 320 and 640 CSS-pixel widths and short viewports. Growth
  must not obscure the action or focused content.
- Check that advanced tools stay open across steps and that hiding them preserves drafts, parameters, results and selected profile. Confirm all capabilities in the table remain reachable.
- Check review-panel keyboard containment and return to its actual trigger.
- Preserve complete-data access, exact selected SQL, stale results, truthful
  counts, explicit saves and receipt-based publication in existing tests.
- Update focused component/browser tests for adopted behavior and run the UI
  suite. No repeated-model-run or infrastructure matrix is introduced.
- Have a clinical/program user and an analyst walk the common and SQL paths.
  Final Dashboard acceptance remains the existing live owner review.

Staff can inspect their original question, selected source, returned data and
limitations; the interface must not pretend this proves that generated SQL
captures their intent. Keep analyst review available, avoid invented plain-text
assurances about SQL, and test how staff understand the review step.

The mock demonstrates layout and selected transitions only. It does not prove
generation, SQL validation/execution, durable storage, multiple-widget
arrangement, import, or production accessibility conformance.

## Preview

From the repository root:

```sh
python3 -m http.server 18445 --bind 127.0.0.1 --directory docs/specs/staff-workbench-ux
```

Open [the preview](http://127.0.0.1:18445/index.html). Outer controls switch
fictional states and real iframe widths; they are review tools, not product
controls. `index.html` also opens directly without a build, installed packages,
service access, or credentials.

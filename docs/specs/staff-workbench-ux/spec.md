# Catalyst workbench usability design

**Status:** Dated design evidence frozen by the owner on 9 September 2026 and
merged through PR #81. Accepted behavior is incorporated into the current
[product specification](../../specification.md) and
[binding design](../../dashboard-builder-mvp-design.md). This file records the
reviewed target and mock, not deployed behavior, delivery progress, or final
product acceptance. See the [implementation handoff](implementation-handoff.md)
for current authority and delivery references.

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

Use existing React, Carbon, and CodeMirror components. This design adds no
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

The first screen leads with “What would you like to find out?”, the selected source,
a brief explanation of prepare/review/run, and the input. Move the raw schema
card grid into the complete data browser. Do not add example-prompt buttons.

Use two main navigation destinations: **Explore** and **Saved work**. Explore
maps to the existing Workbench. Saved work contains **Saved queries** (Datasets),
**Charts and tables** (Widgets), and **Dashboards**. These are interface labels
and grouping changes; the domain objects, APIs and save behavior keep their
existing identities. The active main-navigation item uses normal text on the
neutral header with a thin purple underline; avoid pale purple text on a purple
filled tab. Keep the same treatment in light and dark appearances. This explicitly
amends the existing navigation presentation.

Remove the permanent development-style sidebar. Use a centered content column,
a comfortable writing card, readable type and restrained borders. Use neutral
light surfaces or charcoal dark surfaces, with clear violet accents for actions
and focus. Keep the approved light appearance, including its deep-purple
secondary actions. In dark mode, navigation, links and secondary actions use
off-white text; filled purple actions use white labels in both modes. The owner
rejected broad purple tinting, a gold header stripe, and
dusty lavender buttons. Keep the OpenClinAI connection to a small purple mark
with a tiny gold highlight. These are visual preferences, not evidence of better
clinical outcomes. Reuse Carbon controls and semantic theme tokens.

“What data is available?” opens a companion browser that stays usable while
writing. It serves the existing complete-schema requirement; the interaction
contract below replaces the mock's earlier blocking data dialog.

Place exact model names and profile configuration in **Query settings**. Keep
that control directly accessible beside the question field. AI-prepared output
is identified as such. The selected profile is explicit in the chooser and in
advanced view; it is not an always-visible model badge in the simple view. This
amends the binding visibility requirement without introducing automatic model
selection, substitution, or fallback.

### Complexity is disclosed, not removed

Put **Advanced mode** in the header's quieter **View options** disclosure,
alongside Appearance. It is a workspace-wide presentation preference, not a
local editor toggle. Default off; show a small “Advanced” indicator in View
options while enabled. Keep the setting through query preparation, results,
data browsing, review, and library visits for the active visit; no role system, separate expert application, or server preference
service is needed. Individual controls remain reachable without enabling the
whole advanced mode. Switching views must preserve drafts, parameters, selection,
query/execution identity, results, and focus.

| Capability | Simple view | Direct access / advanced view |
| --- | --- | --- |
| Question and source | Always visible | Same source/session and request state |
| SQL editing | View or edit SQL | Keep the single editor open, with Format, Wrap, Validate, Restore, Clear, parameters and history |
| Complete schema | What data is available? | The same complete browser, with exact relation identifiers also shown in its collapsed rows |
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
monospace for SQL or exact identifiers. In Advanced mode, expand SQL, parameters,
generation details and result provenance by default; expose exact source/model
context and technical object identities alongside the same library items. Keep
explicit execution/save/publish actions unchanged. In simple mode, each capability
remains directly accessible through its named disclosure.

### Appearance

Use **View options → Appearance → System / Light / Dark**. Reuse the existing
`useThemePreference` in `catalyst-ui/src/features/query/theme.ts`, including
`catalyst.theme` persistence, system following, and fallback when storage is
unavailable. Theme and Advanced mode are independent choices. Switching either
must preserve the question, SQL, parameters, selected source and results.

| Role | Light reference | Dark reference |
| --- | --- | --- |
| Page / surface | `#fafafa` / `#ffffff` | `#19191c` / `#222225` |
| Main text | `#252329` | `#eeeef0` |
| Primary action / text | `#7540d0` / white | `#8b4cf0` / white |
| Links and disclosure text | `#6d35c3` | `#eeeef0` |
| Active main-navigation text | `#252329` | `#eeeef0` |
| Focus | `#7540d0` | `#bb99ff` |
| Brand detail | OpenClinAI purple `#4b2e83`, small gold `#f2c75c` dot | Same small mark |

The action hues are a proposed Catalyst adaptation, not an official UW palette
claim. Gold is not a general border, focus or text color. Warning, error and
success roles retain distinct semantic colors and text; they are not recolored
as branding. Map these roles to the existing Carbon theme tokens, including
hover/focus/disabled states. This proposes an amendment to the binding design's
Gray 10 color values, not a component-library replacement or new theme service.

The preview's small `appearance.js` uses a separate preview-only preference;
production must use the existing React implementation.

### Browse data while writing

**Available data is nonmodal.** It must not dim or disable the question, take
over keyboard navigation, execute a query, or display result rows. Desktop uses
a companion panel alongside the workspace and composer; the selected source is
named at its top. The question remains editable while the panel is open.

- Lead with supplied readable labels and short, reviewed descriptions. An open
  item exposes exact table/view names, field names and types. Without a supplied
  label or description, show the exact identifier; do not invent clinical
  meaning, silently rename relations or hide undescribed data.
- Search names, descriptions and fields across the **whole readable schema**,
  not just the current page. Preserve the existing source/test filters where
  applicable, pagination, counts, loading, empty and error/retry states. Clearing
  search or filters restores full access. UI filtering never changes model schema.
- “Back to your question” focuses the composer without closing the browser.
  Keep search, expanded items, scroll position, question and SQL while moving
  between them. Closing and reopening retains browsing state for that source.
  Changing source refreshes its browser context; do not show old-source metadata.
- On narrow screens, use the upper workspace area for the browser and keep the
  composer below. Closing restores the previous workspace. Preparing a query
  returns the upper area to query review; reopening restores the browser state.
  On very short screens or with the software keyboard open, allow normal page
  flow rather than compressing either region until it is unusable.
- Opening focuses search. Tab can leave the panel; it is not trapped. Close or
  Escape from inside the browser returns to its opener (or a stable workspace
  heading if that control was replaced). Escape while writing does not close it.
- Use the existing schema retrieval/browser components, Carbon search and
  accordion controls, and responsive layout. No new indexing, model-generated
  catalog, schema allowlist, data-preview service, or second workspace state.

The mock uses three explicitly fictional relations to demonstrate search and
browsing. This does not establish complete live catalog retrieval or pagination.

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
| Available data | Existing complete-schema retrieval/browser state; nonmodal companion region, Carbon Search and Accordion. |
| View options | Existing theme preference plus one visit-level Advanced mode; Carbon Select/Toggle in an accessible disclosure. |
| Model details | Existing profile chooser and evidence; Carbon Select where appropriate. |
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
- Check that Advanced mode applies across Explore, data browsing, result review and Saved work; switching it preserves drafts, parameters, results and selected profile. All capabilities remain reachable in simple mode.
- Browse and search while typing; preserve draft, SQL, expanded items and scroll. Verify keyboard return, no focus trap, narrow layout and complete live schema access, including missing descriptions and retrieval failures.
- Verify System/Light/Dark, explicit preference retention, system-change handling, and text/control/focus contrast in each mode. Inspect results, errors, warnings and overlays as well as the landing page.
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

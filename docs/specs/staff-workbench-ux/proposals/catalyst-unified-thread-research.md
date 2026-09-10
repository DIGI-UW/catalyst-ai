# Unified Catalyst thread: research and interface options

**9 September 2026 exploration · Retained research, not current navigation authority.** The sidebar choice below was superseded on 10 September 2026: retain the [approved Explore / Saved work shell](../spec.md#screen-hierarchy-and-language) and integrate its richer saved-work groups. Multi-artifact and output interactions are separately scheduled follow-on design inputs.

## Recommendation

Retain Catalyst's existing source-bound, turn-based Workbench through SQL → Dataset → Widget → Dashboard. Keep earlier turns as compact read-only summaries and one full-width active work surface with a contextual composer. A unified Library contains saved Datasets, Widgets, and Dashboards, with links back into the thread. Publication is an explicit action over saved versions and appears in the history.

This extends Catalyst's existing chronological Workbench, artifact tiles, and review panel. The current binding design already preserves one active SQL editor and earlier read-only turns. The new decision is to extend turn types and reviewable design proposals, not introduce a second dashboard conversation.

## Relevant precedents

| Source | Verified pattern | Implication for Catalyst |
| --- | --- | --- |
| [Hex Threads](https://learn.hex.tech/docs/explore-data/threads) | A conversation is backed by a project. Thread, notebook, and app views can be shown beside one another; artifact references navigate to cells. | Keep a durable artifact model behind the conversation and direct links from turns to the focused editor/preview. Hex is an interface precedent, not an additional output candidate. |
| [Hex Notebook Agent](https://learn.hex.tech/docs/explore-data/notebook-view/notebook-agent) | Can edit SQL, charts, and app layout. Proposed changes can be confirmed or undone per cell; it inspects dependencies when changing cells. | Keep artifact-level review and dependency-aware updates. Catalyst retains its own explicit execution/publication boundaries and one-source contract. |
| [Metabot](https://www.metabase.com/docs/latest/ai/metabot) | Uses current-question context and supports reviewable SQL changes. Documented limitations include chart formatting and SQL parameters. | Its native assistant is not a complete replacement for Catalyst's iterative design layer. The Metabase advisor must reflect actual version-specific capabilities. |
| [Evidence Agent](https://docs.evidence.dev/features/evidence-agent) | Its hosted Studio agent uses version-controlled shared context and task-specific skills. That agent is Studio-only. | Reuse the distinction between shared intent and task-specific prompts in Catalyst. Do not assume the open-source renderer includes the hosted agent. |
| [marimo execution model](https://docs.marimo.io/guides/reactivity/) | Tracks dependencies; lazy mode marks affected cells stale instead of rerunning them automatically. | Use visible stale/update states while preserving explicit Run. Catalyst's immutable saved versions need explicit downstream adoption rather than automatic mutation. |

These sources establish product patterns, not proof of usability or integration compatibility for Catalyst. The recommended combination is a design inference.

## Layout options

| Option | Strength | Cost |
| --- | --- | --- |
| **A. Thread + focused artifact — considered** | Context and SQL/chart/layout stay visible together. Fits iterative cross-artifact requests and gallery-to-thread navigation. | Less horizontal space and greater departure from the existing Workbench. |
| **B. Existing full-width turns — selected** | Preserves Catalyst's current chronological notebook; the latest turn owns the editor/preview, and one composer follows up in context. | Requires compact read-only history and careful handling of artifact review without multiplying active editors. |
| **C. SQL / Widget / Dashboard focus modes** | More room for each specialized editor while retaining one underlying history. | Mode changes can hide context and feel like a wizard unless return paths and the active artifact remain obvious. |

All three retain the saved artifact types. During mock review, the user rejected horizontal-tab complexity and selected **Workbench** and **Library** as the two top-level places. They then explicitly asked to retain the current turn-based approach and avoid unnecessary drift, selecting B. Library has **Datasets**, **Widgets**, and **Dashboards** subsections in the sidenav, synchronized with the shared gallery's type filter. Library itself shows all saved work; subsection selection updates the heading, count, filter, and current navigation item together. SQL, Widget, Dashboard, and publication work stays inside the current Workbench turns. External precedents inform artifact references and review behavior; they do not justify replacing the existing interaction model.

## Concrete HIV walkthrough for review

1. SQL turn: prepare the visit query, explicitly Run, inspect the sole result panel, and save a Dataset.
2. Widget turn: compare line and bar over that Dataset, apply a presentation choice, and save the Widget.
3. Dashboard turn: arrange visits, CD4 result counts, and medication requests. Review the undated medication exemption.
4. Refine turn: “Use quarters and put the summary first.” Compare the suggestion, apply, and save.
5. Upstream turn: “Change the visit query.” Keep the old saved Dataset and published output intact; a new saved version becomes an explicit update candidate for the Widget and Dashboard.
6. Library round-trip: open a saved Widget, inspect its Dataset version, return to its originating turn, and continue without losing context.
7. Output turn: choose Metabase or Evidence, inspect capability/source findings, then publish the selected saved design only when ready.

Use the current ask and artifact context with SQL, Widget, Dashboard, and target-capability prompt variants internally. These are not exclusive turn modes. The next design recommendation is one ask producing one turn with multiple affected artifacts where needed, preserving per-artifact review, exact SQL execution, and saved dependencies. Saved Datasets retain their SQL and parameters, and the Library should expose Start from this SQL directly. Additional agents should follow an observed need; no automatic competing team or scoring mechanism is needed to demonstrate this workflow.

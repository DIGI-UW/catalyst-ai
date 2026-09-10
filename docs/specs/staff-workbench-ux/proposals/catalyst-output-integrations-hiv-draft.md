# Catalyst: one thread, reusable artifacts, multiple outputs

**Consolidated proposal · 10 September 2026.** Current behavior is defined by the [product specification](../../../specification.md) and [binding design](../../../dashboard-builder-mvp-design.md). The [Feature 008 plan](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/008-catalyst-query-workbench/plan.md#design-extension-review) owns scheduling; the approved shell remains Explore / Saved work. Grouped saved work and saved-SQL reuse enter current delivery; multi-artifact design, shared controls and additional outputs are scheduled follow-ons whose detailed designs require review.

## Purpose

Let a person continue one Catalyst thread through SQL, Dataset review, Widget design, Dashboard design, and publication. Metabase and Evidence are the two new MVP output candidates. Superset remains the existing output. Saved work makes saved queries (Datasets), charts and tables (Widgets), and Dashboards findable and reusable; these remain distinct artifact types even if their galleries share one shell.

Model-assisted design and explicit shared-filter behavior are follow-on A; Metabase and Evidence are follow-ons B and C. These start after the current UX and Superset delivery. Their detailed contracts do not replace the binding Dashboard Builder design. The existing question, SQL editor, Run, Dataset review, Widget review, and arrangement flows remain the upstream workflow.

## Target workflow

An analyst working with the OpenMRS HIV demo source asks:

> Show visits and recorded CD4 count results over time, plus medication requests. Let me compare patient gender and switch between months, quarters, and years.

1. Review and run the selected SQL in the existing Workbench. Save the successful results as three Datasets and review the proposed Widgets.
2. Continue in the same **HIV clinic activity** thread. Each ask produces a turn whose contents follow the current request and the work being modified. That turn may contain SQL/Dataset work, Widget work, Dashboard work, or a combination. Earlier turns stay visible as compact summaries. Selecting an artifact opens its existing editor or review panel.
3. Select **Design for Metabase** or **Design for Evidence**. Ask, for example, “Put medication requests first, then show both trends by quarter.” A tool-aware advisor proposes a design revision and a concise change list.
4. Compare **Current** and **Suggested** views. Apply or discard the proposal; undo an applied edit when needed. Repeat, then save the design as an immutable Dashboard version. Choose **Publish** and an already configured Test or Production destination.
5. Inspect source readiness and the publication summary. Preview remains available when a connection is unavailable, but a preview never enables publishing by itself.
6. Publish explicitly. Show success only after the destination confirms the selected version is available. Open the resulting destination link. Subsequent changes are visibly awaiting publication; the previous successful publication remains recorded.

## HIV content and controls

All numbers in the mock are invented demonstration counts. They are not queried from OpenMRS and do not describe patients or clinical outcomes. The chart subjects and limitations are grounded in the existing source assets; the intended Spark schema must still be discovered and checked.

| Widget | Definition proposed for review | Period / time unit | Patient gender |
| --- | --- | --- | --- |
| Visits | Count distinct encounter records, grouped by encounter start date. A visit is not a unique patient. | Both apply | Applies |
| Recorded CD4 results | Count distinct observations for the reviewed CD4 **absolute-count** concept. Do not include CD4 percentage or aggregate the clinical result values. | Both apply, using observation date | Applies |
| Medication requests | Count distinct request records, excluding requests marked `doNotPerform`. This is a request count, not medication use or adherence. | Exempt; explicitly labeled **All dates** | Applies |

The current medication export has no request date. A future dated medication chart would need an explicitly reviewed encounter-date join and handling for unlinked records. This draft chooses the visible exemption instead of implying a request date exists. No viral-suppression, treatment-coverage, or adherence measure is inferred from the available columns.

Controls are **Period**, **Time unit**, and **Patient gender**. The mock offers two fixed periods and Month, Quarter, Year. Unknown gender remains a selectable category. Production choices must come from the actual reviewed source values; the sample categories are illustrative.

Time grouping uses real period-start values. Visible labels are `Sep 2025`, `Q3 2025`, and `2025`; sorting remains chronological. Partial periods retain only the selected dates and are labeled as partial. Missing observations are not silently presented as known zero activity. These count metrics can be summed only after record deduplication; the proposal does not generalize this to rates or distinct-patient counts.

## Proposed interface

Keep Explore / Saved work without a permanent sidebar, as confirmed by the owner. Preserve the approved palette, composer and shared state. The multi-artifact interactions below are follow-on review inputs, not additions to the current UX gate.

Extend the current turn-based Workbench with minimal visual change, as explicitly requested during mock review. Keep its full-width chronological stack, collapsed read-only earlier turns, one latest active work surface, artifact tiles, and one contextual composer. SQL, Widget, and Dashboard requests create successor turns in that same stack. A separate chat column beside an editor is not the selected direction. **Design for** selects output capability context. **Publish** is an action on a saved Dashboard; its attempt and receipt stay with that work.

The current ask and the artifact being modified provide context. SQL, Widget, and Dashboard describe the work within a turn; they are not mutually exclusive turn modes and require no scope-selection step. This is separate from the program's Phase 1/2/3 delivery order. Earlier SQL stays read-only; only the latest turn owns the single active editor and explicit Run action. Selecting an old artifact changes review focus, not history. The existing profile selection, SQL controls, evidence, and source browser remain required production behavior even where this small mock omits them.

### One ask can affect several artifacts

**Follow-on A contract to review before implementation:** one ask produces one turn, containing every artifact change needed to fulfill that ask. For example, “Show Visits as bars and move medication requests above the trends” proposes a Visits Widget revision and a Dashboard revision in the same turn. The saved Dataset SQL remains the same. The Dashboard proposal explicitly references the proposed Widget revision.

- Show affected artifacts using the existing tiles and review surfaces within that turn. A concise change description identifies what each artifact will change; no new navigation mode is needed.
- Review related changes together. Keep the existing Run and per-artifact Save actions for the first implementation. A save action or a rendering step is not another user turn. A follow-up ask creates the successor turn.
- If the request changes SQL as well as presentation, keep the SQL proposal and dependent Widget/Dashboard proposals in this turn. Review each exact SQL draft through the one canonical editor and explicitly Run it. Saving a Dataset requires that draft's successful execution and result review.
- Save dependent artifacts against the reviewed saved versions they actually use: Dataset, then Widget, then Dashboard where those dependencies exist. Do not publish a Dashboard that refers to an unsaved proposed version.
- Changing a shared artifact does not update every Dashboard that uses it. Include only downstream adoption needed for the current ask; show other uses as available updates.
- Independent changes may still be reviewed and saved if another artifact fails. Clearly mark dependent work as waiting. Keep the earlier saved Dashboard and published output intact; do not claim the whole request is complete.

This preserves one active SQL editor even when an ask affects multiple queries: artifact tiles choose which draft occupies that editor, with other drafts retained. It extends the turn's contents, not the Workbench's navigation. A combined “Save all” transaction is a separate convenience decision; it is not needed to permit a turn to affect more than one artifact.

The embedded mock places the composer in normal flow so it cannot cover review actions. The existing production composer dock, profile/model controls, source browser, and SQL execution controls remain part of the binding contract; this proposal does not replace them.

### Saved work and galleries

Keep **Explore** and **Saved work** as the two main destinations. Group **Saved
queries**, **Charts and tables**, and **Dashboards** within Saved work using the
existing shared library and saved-version identities. The exploration's
Workbench / Library sidebar is superseded. A single selection drives the
active group, title, count and content at wide and narrow widths; retain it when
returning from Explore. Opening a saved artifact uses the existing review flow
and preserves the ongoing question and editor draft.

| Gallery | What its items show | Main actions |
| --- | --- | --- |
| Saved queries (Datasets) | Title, saved SQL and parameters, source, columns, saved version, originating query/run, downstream use | Review; Start from this SQL |
| Charts and tables (Widgets) | Preview/type, Dataset version, saved version, dashboards using it | Review; Refine in thread; Add saved version to a Dashboard |
| Dashboards | Preview/layout, included Widgets, source, per-target publication state | Open in thread; Arrange; Publish |

Gallery actions reference saved versions. The follow-on Refine action resumes the originating source-bound thread, selects the artifact, and creates a successor turn when the user asks for a change. Reuse in another compatible thread creates a reference to the chosen version. Different-source reuse requires an explicit new session or source choice; it cannot silently switch the current connection. Unsaved proposals are kept in the thread, not presented as saved gallery items.

### A saved Dataset is a reusable SQL starting point

Save Dataset must preserve the query itself, not only a result reference: the parameterized SQL text, typed parameter values used for the saved execution, and the compiled SQL snapshot, together with source/query/execution identities and typed result metadata. The editable starting point is the saved parameterized SQL plus its parameters; the compiled SQL remains execution evidence. Retain the source's declared dialect under the existing generic-connection contract.

**Saved work → saved Dataset → Start from this SQL** loads that exact saved SQL and those parameters into the Workbench's current query workflow. It preserves the selected Dataset as the starting reference and creates a new draft without rerunning anything or overwriting the saved version. Preserve any ongoing editor draft. The person can run it unchanged or ask for a refinement. Reuse the same-source session when appropriate; a different source requires an explicit source/session choice. Saved SQL remains accessible from the Dataset even when the original session's detailed execution evidence cannot be loaded. Evidence can be reported as unavailable separately.

[Dataset storage](../../../../catalyst-gateway/src/catalyst/dashboard_builder.py) already retains parameterized SQL, typed parameters and compiled SQL. [Dataset review](../../../../catalyst-ui/src/features/query/components/DashboardPublishPanel.tsx) currently displays SQL from the loaded source execution. The design addition is first-class reuse from the saved Dataset configuration, independently of that execution-history display. Reuse is approved for current delivery; it is not yet implemented.

### Changes upstream

An edited SQL draft does not invalidate an older, immutable saved Dataset or a published Dashboard. Its own previous run is stale until the exact new SQL runs. Saving a new Dataset version exposes an **update available** on dependent Widgets. Adopting that version requires review of column bindings and measure meaning; changed or missing columns are actionable findings. A newly saved Widget similarly offers an explicit update to dependent Dashboards. Runs and saves add evidence or saved versions within the current turn; a follow-up ask appends a turn. Existing saved versions are not overwritten or automatically republished.

Destination configuration belongs in deployment administration; this MVP selects existing configurations and does not add a credential-management screen.

The host's design controls compare side-by-side versus stacked charts and vary connection/publication scenarios. These are mock-review controls, not an administration screen in the proposed product.

### Iteration and ownership

- A suggestion is a candidate revision, not a saved Dashboard. The preview identifies whether it is showing the current or suggested design.
- Apply changes the working draft; Save creates the immutable version used for publication. Discard retains the current design. Undo restores the prior applied draft without erasing conversation evidence.
- Preview filters are exploratory. Changing the period or gender in the preview does not silently change saved defaults. A design request to change a default produces an explicit proposal.
- Target selection changes the advisor's capability context and the output preview, not the metric definition. Any target-driven layout, label, or control change is proposed visibly.
- The first mock uses one shared design across both targets. Target-specific overrides are a later decision; if introduced, they must be shown and versioned rather than accumulating hidden differences.
- A change to cohort, deduplication, a measure, a date field, or aggregation SQL returns to Dataset/SQL review and an explicit Run. A presentation advisor cannot make that change as a cosmetic edit.
- Preserve the original request, model/prompt/capability versions, proposal, applied/discarded decision, and parent design version. Do not rank advisors or automatically select a winner.

### Tool-specific advisors and prompts

Use one shared session and the current ask's artifact context. A request may need the SQL prompt, a Widget prompt, a Dashboard prompt, or several of them; prompt selection is internal work rather than a user-facing scope mode. SQL work uses the existing writer/execution path. Presentation work adds the selected Metabase/Evidence capability context. Bring their proposals back into the same turn with explicit artifact references and dependencies. This does not require different models or a mandatory multi-agent team. Agents do not own separate user-facing histories.

The design advisor receives saved Dataset identities, columns, reviewed measure/filter definitions, the current artifact and dependencies, prior user instructions, the user's request, and verified target capabilities. It does not require patient-level rows. The SQL writer continues to receive the complete readable schema and declared dialect under the existing contract. Intent routing does not hide relations, choose a model team, or grant execution permission.

**Metabase advisor:** propose compatible cards, layout, filter-to-card connections, date ordering, and grouping controls. Distinguish ordinary object APIs from paid serialization and embedding. Flag unknown support for restricted grouping choices or dynamic labels instead of promising it.

**Evidence advisor:** propose report composition, supported chart/input components, explicit date-grain options, and shared control references. Keep source SQL in its declared dialect, distinguish direct-source connectivity from preview rendering, and flag the standalone Spark connection until proven.

Both return an explanation plus a structured change proposal using supported design fields. A turn's proposal can contain several affected artifacts, each with its own base version, changes, and dependencies. Ask a question only when the current request and context leave a concrete choice unresolved. Exporters validate accepted proposals and produce the target artifact; model text is not executed as code. Optional target preview/inspection tools can feed rendering findings into the next revision once integrations exist, with provenance retained. A designer preview and a confirmed native render remain different states.

Concrete starting prompts and the response shape are in [Advisor prompt drafts](catalyst-dashboard-advisors-draft.md).

| State | What the person sees | Available action |
| --- | --- | --- |
| Saved, unpublished | Destination, environment, saved defaults, and readiness | Preview; Publish when ready |
| Pending suggestion / unsaved draft | “Apply or discard the suggestion, then save your design” | Compare; Apply/Discard; Save |
| Connection needs verification | Source name and a specific unresolved connection | Preview; check again; choose another destination |
| Destination not configured | The selected environment has no destination | Choose a configured environment |
| Publishing | The selected version is being published | Progress; prevent duplicate submission |
| Published | Confirmed destination and selected version | Open dashboard |
| Publication failed | Actionable error; prior successful link retained when one exists | Retry the same saved version |
| Changes to publish | Previous publication remains available; current version differs | Publish update |

Switching destination never alters saved SQL, Widgets, or layout. Metabase and Evidence keep independent publication records. Previewing does not publish. The mock simulates all external outcomes; “Open dashboard” opens an intended-output example inside the mock, not a real Metabase or Evidence instance.

## Candidate integration shape

Use the saved Catalyst Dataset, Widget, and Dashboard versions as the common input. Implement two explicit output writers and a small common publication record; do not introduce a general plugin platform.

| Candidate | Proposed handoff | First technical proof |
| --- | --- | --- |
| Metabase | Create/update native SQL questions, chart settings, dashboard cards, and parameter connections through a separately invoked publisher. Keep a mapping from Catalyst logical/version identities to destination objects. | Connect to the selected Spark source, render a saved query, and preserve the reviewed filters and ordering on repeat publication. Open-source publication uses ordinary object APIs; supported YAML serialization is a paid alternative. |
| Evidence | Generate a reviewable project containing SQL, page components, layout, and control definitions; deploy the pinned artifact to a configured self-hosted destination. Keep connection secrets in deployment configuration. | Establish a supported direct connection to the **same** selected source. Databricks support is not proof of standalone Spark compatibility. Until this passes, Evidence remains previewable but unavailable for live publication. |

A publication record identifies the target, environment, Dashboard version, source, artifact digest, attempt state, destination object/link, and confirmation. Retry must reconcile the same intended version rather than create duplicate dashboards. A failure cannot overwrite a successful receipt. Automatic rollback is not part of this first design; any partial update must be reported honestly.

The output must query the configured source. Catalyst's bounded preview rows are not a substitute dataset or a new warehouse. Output templates must preserve the reviewed measure and filter meaning; changing aggregation SQL requires explicit review of the executable form. Unsupported behavior is reported before publication, without silently dropping a filter or rewriting its meaning.

## MVP boundaries and open decisions

- One source per session/Dashboard; a unified typed thread; saved-artifact galleries; two candidate targets; preconfigured destinations; iterative presentation proposals; one-way publication; the three demonstrated Widgets and shared controls.
- Source compatibility is a capability of a specific source/destination pair, not a claim that a product supports every Catalyst source.
- No migration of arbitrary existing Superset dashboards, bidirectional editing, production authorization design, scheduling, or arbitrary model-written executable components. Model-proposed design fields are explicitly in this draft's scope.
- Decide whether Evidence's source connection can be supported within a small integration. Do not add a replacement warehouse merely to make the demo work.
- Confirm whether Metabase's open-source API publishing effort is acceptable or a paid file-import workflow is preferred.
- Review iterative design suggestions, shared filters, and time-unit scope as explicit additions to currently deferred work.
- [Research and interface options](catalyst-unified-thread-research.md) preserves the earlier exploration. Its sidebar choice is superseded by Explore / Saved work; retain the existing turn-based workflow and group the artifact types within Saved work.

## Review and implementation checks

Design review should walk the same HIV example through both choices, including Evidence's unavailable connection. Before implementation acceptance, demonstrate:

1. The same history and composer serve SQL, Widget, and Dashboard turns. Gallery round-trips preserve the selected artifact and draft. Current/suggested comparison, Apply, Discard, Undo, and Save preserve lineage. Changes to data meaning return to query review.
2. Period and grouping update both trends; medication requests remain unchanged and visibly exempt. Gender affects all three.
3. Months, quarters, and years sort correctly, with partial-period behavior visible.
4. Unsupported source/control combinations prevent publication while retaining drafts.
5. Publishing and retrying the same version creates one intended dashboard; changed versions update that logical dashboard. Receipts and errors describe the actual result.
6. Test and Production use independently configured connections without moving credentials or internal object IDs in hand-edited files.
7. Keyboard, narrow layout, and light/dark appearance are usable. Native destination renders must be checked separately from this mock.
8. One ask affecting a Widget and Dashboard remains one turn; a SQL-dependent variant preserves exact Run and Dataset review, and a failed query does not save invalid downstream references.
9. Saving and reopening a Dataset preserves SQL and typed parameters. Start from this SQL restores them unchanged into the one editor, leaves execution explicit, and works when detailed source-session evidence is unavailable.

Review saved-SQL reuse in the approved mock for current delivery. Extend that same mock with the multi-artifact and output scenarios when their follow-on milestones start. Design approval does not constitute acceptance of working integrations.

## References

- [Current product scope](../../../specification.md) and [implementation sequence](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/008-catalyst-query-workbench/plan.md).
- [Current Dashboard Builder requirements](../../../dashboard-builder-mvp-design.md), especially the saved-object and one-way publication flow.
- [Current OpenMRS Spark exports](https://github.com/pmanko/clinical-ai-validation-harness/tree/main/catalyst-sources/openmrs-hiv/config/views): encounter `period_start`, observation `obs_date`, patient `gender`, and medication `doNotPerform`. The medication export has no request date. Coding/name arrays can produce repeated resource IDs, so counts require reviewed deduplication. These definitions do not prove live values, CD4 concept selection or join correctness; verify the complete discovered Spark schema and a real result. Retired PostgreSQL view names are not acceptance inputs.
- [Metabase Spark SQL](https://www.metabase.com/docs/latest/databases/connections/sparksql), [API behavior](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/metabase-api), and [paid serialization](https://www.metabase.com/docs/latest/installation-and-operation/serialization).
- [Evidence source and license](https://github.com/evidence-dev/evidence), [self-hosting requirements](https://docs.evidence.dev/self-host), and [date-grain selector](https://docs.evidence.studio/components/date_grain_selector).

## Target checks before implementation

- Metabase documents [SparkSQL connectivity](https://www.metabase.com/docs/latest/databases/connections/sparksql) and [SQL time-grouping parameters](https://www.metabase.com/docs/latest/questions/native-editor/time-grouping-parameters). They do not prove this deployment, restricted grouping choices or correct native labels. Its [serialization](https://www.metabase.com/docs/latest/installation-and-operation/serialization) requires Pro or Enterprise; select the intended ordinary-object API path or paid alternative explicitly.
- Evidence documents a [self-hosted server using direct connectors](https://docs.evidence.dev/self-host) and a [date-grain selector with preset choices](https://docs.evidence.studio/components/date_grain_selector). Pin one supported runtime and validate the component/connector combination. Databricks support and hosted warehouse documentation do not establish standalone Spark compatibility. A preview cannot satisfy connection or publication acceptance.
- Keep Superset remediation as a dependency of the existing Superset delivery. Review its actual merged version and importer changes when available; alternative outputs do not replace that acceptance.

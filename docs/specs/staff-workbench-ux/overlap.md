# Overlap with Catalyst and the validation harness

Reviewed 9 September 2026. This proposal belongs to the existing Workbench and
Dashboard Builder effort, with the same product boundaries and acceptance owners.

## Sources inspected

Catalyst baseline: `main` at `4c6a46fa121ea7ce6dff7784547e2eb6aa236fa6`:

- [Product specification](../../specification.md).
- [Binding design](../../dashboard-builder-mvp-design.md): ASK-01–04, DATASET-01–04, THREAD-01, A11Y-01, composer, libraries and review panel.
- [Prototype and priority rules](../../prototypes/dashboard-builder-mvp/README.md).
- [Roadmap](../../roadmap.md) and [model integration boundary](../../med-agent-hub.md).

Harness baseline: `main` at `bac17a7e5d6e6425401dc735455cab8497392eca`:

- [Program roadmap](https://github.com/pmanko/clinical-ai-validation-harness/blob/bac17a7e5d6e6425401dc735455cab8497392eca/specs/catalyst-program-roadmap.md).
- [Implementation plan](https://github.com/pmanko/clinical-ai-validation-harness/blob/bac17a7e5d6e6425401dc735455cab8497392eca/specs/catalyst-implementation-plan.md).
- [Feature 008 spec](https://github.com/pmanko/clinical-ai-validation-harness/blob/bac17a7e5d6e6425401dc735455cab8497392eca/specs/008-catalyst-query-workbench/spec.md), [tasks](https://github.com/pmanko/clinical-ai-validation-harness/blob/bac17a7e5d6e6425401dc735455cab8497392eca/specs/008-catalyst-query-workbench/tasks.md), [plan](https://github.com/pmanko/clinical-ai-validation-harness/blob/bac17a7e5d6e6425401dc735455cab8497392eca/specs/008-catalyst-query-workbench/plan.md), and [delivery goal](https://github.com/pmanko/clinical-ai-validation-harness/blob/bac17a7e5d6e6425401dc735455cab8497392eca/specs/008-catalyst-query-workbench/dashboard-mvp-delivery-goal.md).

Also compared authority changes on the open harness Spark-remediation branch at
`1d8511a097e10ee7ead178c904470ef5558edf64`. They describe connection implementation
and completed tasks, not a competing question-composer redesign. PR/branch
findings here are point-in-time observations.

## Requirements, implementation, and proposed changes

These are three separate questions. **Existing requirement** means a document
already calls for the behavior, not that the behavior works. **Source** below
means inspection at Catalyst `4c6a46f`; **Browser** means the earlier 9 September
review of the running `c0e11c7` checkout. That browser review is not a fresh
execution of `4c6a46f`. Unverified behavior stays unverified.

| Area | Existing requirement / planned scope | Implementation evidence | What this proposal changes |
| --- | --- | --- | --- |
| Resize question field | Binding composer explicitly specifies `resize: none`. | **Source:** `TurnNotebook.css:449` still disables resize; `QuestionForm.tsx` uses Carbon TextArea while follow-up uses raw textarea. **Browser:** both sources had a 72 px follow-up; an eight-line input overflowed. | **New design amendment:** vertical resize, common first/follow-up presentation. |
| Expand/Restore | Full/line/tucked composer modes; existing flicker regression. | **Source:** `TurnNotebook.tsx` and `composer-flicker.spec.ts` implement/test automatic scroll modes. This review did not exercise all modes live. | **Interaction amendment:** explicit size controls replace automatic shrinking. |
| Staff-first landing / data browsing | ASK-04 and product spec already require compact access to every readable relation. | **Source:** `QueryWorkspace.tsx` renders a card for each relation. **Browser:** 30 technical cards dominated the OpenELIS landing screen. Completeness of all connected schemas was not independently validated here. | **Presentation amendment plus existing scope:** Explore/Saved work navigation replaces the permanent sidebar. Domain names/APIs remain; complete browsing is retained, without relation filtering or example prompts. |
| Browse while writing | ASK-04 and the binding available-data disclosure already require an in-place, complete searchable/filterable/paginated source browser with loading/empty/failure states. | **Source/browser:** the landing card grid above was observed; complete catalog behavior was not validated. The earlier mock used a blocking dialog, not evidence of production implementation. | **Existing scope plus interaction refinement:** nonmodal companion panel, friendly supplied descriptions, exact identifiers and types, whole-schema search, and preserved draft/browse state. Narrow screens share the upper workspace while keeping the composer accessible. |
| Appearance | Binding design specifies Gray 10 and Carbon tokens. | **Source:** `catalyst-ui/src/features/query/theme.ts`, its tests, and `App.tsx` already implement System/Light/Dark, g10/g100 and `catalyst.theme` preference. No new live-app theme acceptance claimed. | **New palette amendment; existing preference reused:** neutral light/charcoal surfaces, clear violet actions, tiny OpenClinAI gold brand detail. View options groups appearance and general Advanced mode. No new theme subsystem. |
| SQL disclosure | ASK-01–03 and Feature 008 already own one editor, snapshots, parameters and explicit Run. | **Browser:** editor, format, wrap, parameters and Run were present. No SQL was submitted during UX QA. | **Presentation amendment:** one clearly named disclosure plus general Advanced mode under View options; Continue prepares, Get results explicitly executes. All analyst controls remain. |
| Compact model setup | Product/model docs require explicit profile selection; binding design exposes detailed choices in the composer. | **Source/browser:** profile controls and long model labels present; first/follow-up presentation differs. Model routing was not retested. | **Visibility amendment:** model identities move into directly accessible Query settings and remain visible in advanced view; selection is explicit, with no fallback. |
| Row limits and status language | DATASET-02 already requires N shown, more available, total unknown; advisory findings remain separate. | **Source:** `WorkbenchPanel.tsx:458` renders the internal truncation reason. **Browser:** OpenMRS showed `configured_limit`; completed results showed “valid” alongside “unreviewed”. Underlying reviewer correctness not adjudicated. | **Existing-scope fix:** truthful plain wording; no confidence score or validation-rule change. |
| Results before traces | Dataset panel currently requires always-visible provenance. | **Browser:** source/trace/query/model metadata appeared before the table. | **Layout amendment:** results first; warnings and errors visible; exact technical provenance in a named disclosure. This changes a visibility requirement. |
| One result table | Product spec, DATASET-02 and harness delivery goal assign the full table to review; some written inline-table descriptions conflict. | **Source/browser:** result rendering exists in both thread and Dataset review. This is a presentation conflict, not missing result execution. | **Resolve ambiguity:** panel owns full table; thread carries summary/action. |
| Focus return | A11Y-01, product accessibility, Feature 008 and delivery goal already require it. | **Source:** `DashboardPublishPanel.tsx:458–485` attempts focus restoration. **Browser:** Escape returned focus to BODY twice. Root cause not established. | **Bug fix:** repair existing trigger behavior, not a new accessibility milestone. |
| Save → Widget → Dashboard | Existing Phase 3 design covers libraries, immutable saves, compatible types, multiple Widgets and arrangement. | **Browser:** empty libraries existed with technical descriptions and disabled creation actions. Populated Widget/arrangement and saves were not exercised. | **Naming/empty-state amendment:** Saved queries maps to Dataset and Charts and tables maps to Widget. Existing objects and capabilities remain. The mock does not establish their completion. |
| Publish/import | Existing design/contracts require exact bundle identity and importer receipts. | Product UI/contracts contain the path; **not browser-tested** in this UX review. No bundle was published/imported. | **Existing requirement:** clearer labels and recovery; no new importer. |
| Broader conversation | Harness Phase 2 follows Phase 1 review. Clarification/unsupported already exist as writer outcomes. | Not exercised against the model in this UX review. | **Excluded:** no interpretation of rows or broader conversation feature; mock outcomes are fictional. |
| Guidance/pinning | Roadmap treats explicit guidance as optional research. | No implementation claim made here. | **Excluded:** no guidance manager, memory or pinning. |
| Component framework | Binding design calls for Carbon React. | **Source:** React, Carbon and CodeMirror already used. | **Reuse:** share duplicated controls; no migration. |

Source references above are relative to `catalyst-ui/src/features/query/` except
`composer-flicker.spec.ts`, which is in `catalyst-ui/e2e/`. Full research and QA
boundaries are in [research-and-qa.md](research-and-qa.md). None of these rows
converts an existing requirement into a claim of implementation acceptance.

## Disclosure without capability removal

The owner requested complexity to be hidden by default and available when needed.
The [capability inventory](spec.md#complexity-is-disclosed-not-removed) records
where each existing tool remains accessible. Advanced mode is a workspace-wide presentation preference under View options.
It controls SQL, parameters, model context, data identifiers and technical
library/review details, independently of the existing theme preference.
Navigation labels, model visibility, action labels and palette are explicit proposed
amendments; existing execution, evidence and publication contracts still apply.

## Open work and workspace overlap

Catalyst had no open PRs at inspection. This documentation PR starts from current
`main` and does not depend on an unmerged UI branch.

| Harness effort | Relationship |
| --- | --- |
| [#100 Spark integration](https://github.com/pmanko/clinical-ai-validation-harness/pull/100) | Owns source integration, comparison and connection evidence. UX consumes those contracts, not a new integration implementation. |
| [#108 query-output repair pin](https://github.com/pmanko/clinical-ai-validation-harness/pull/108) | Separate response-contract repair; do not duplicate model/schema changes here. |
| [#101 project status dashboard](https://github.com/pmanko/clinical-ai-validation-harness/pull/101) | Cross-project repository status hub/GitHub Pages, distinct from Catalyst's clinical-data dashboards. Its cumulative diff also includes Spark/integration work. Later link the accepted UX artifact from that inventory, rather than copying its spec. |
| [#105 cloud sync](https://github.com/pmanko/clinical-ai-validation-harness/pull/105) | Evidence preservation; no UI overlap. |
| [#102](https://github.com/pmanko/clinical-ai-validation-harness/pull/102), [#103](https://github.com/pmanko/clinical-ai-validation-harness/pull/103), [#104](https://github.com/pmanko/clinical-ai-validation-harness/pull/104) OpenMRS submodule updates | Separate companion products; no Catalyst design scope. |

## Joining the existing plan

Keep implementation in the existing Catalyst UI effort. Small composer,
wording, and focus repairs can accompany the upgrade without claiming phase
completion. Full Dashboard Builder acceptance still follows the existing
program checkpoints and requires the owner's live browser review.

If adopted, amend the named sections in the binding design and cross-reference
this spec from the existing Feature 008 tasks. Do not start a second roadmap,
duplicate harness acceptance, or silently change phase order. Merging a design
reference is not acceptance of implemented product behavior.

Some current document headers still describe the Spark path as unimplemented
despite newer code/branch activity. The baselines above prevent those headers
from being mistaken for live deployment evidence. Broader status drift is
outside this UX documentation PR.

## Dashboard extension proposal

The [HIV workflow, saved-SQL reuse and output proposal](proposals/catalyst-output-integrations-hiv-draft.md),
[advisor prompt drafts](proposals/catalyst-dashboard-advisors-draft.md) and
[interaction research](proposals/catalyst-unified-thread-research.md) are
consolidated design inputs. The owner confirmed Explore / Saved work and the
richer saved-work structure on 10 September 2026. Saved-SQL reuse is added to
the product specification and binding design for current delivery. The harness
[Feature 008 plan](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/008-catalyst-query-workbench/plan.md#design-extension-review)
owns disposition and scheduling.

Saved-SQL persistence exists, but its first-class reuse action does not.
Multi-artifact proposals, model-assisted Dashboard design, shared filters and
Metabase/Evidence publication are follow-on milestones after current usability
and Superset delivery. Their interfaces and contracts need review when those
milestones start. The exploratory Workbench / Library sidebar is superseded;
retain its useful artifact grouping within the approved navigation. Keep one
mock and implementation home in Catalyst; the harness publishes that mock.

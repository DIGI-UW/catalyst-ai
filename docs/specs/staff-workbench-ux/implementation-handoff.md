# Frozen design: implementation handoff

The owner froze this design on 9 September 2026. The baseline is
[`8542d5e`](https://github.com/DIGI-UW/catalyst-ai/commit/8542d5e59f40bf1dc2fcde06dd724095fa6d370a)
in [PR #81](https://github.com/DIGI-UW/catalyst-ai/pull/81). The [specification](spec.md),
[mock](index.html), [overlap review](overlap.md) and [research/QA](research-and-qa.md)
form the handoff. Further visual exploration is closed; change this target only
for an identified implementation problem or a new owner decision.

## Current authority and start condition

PR #81 is merged. This handoff and its mock remain dated evidence. Accepted
application behavior now lives in the current
[product specification](../../specification.md) and
[binding Dashboard Builder design](../../dashboard-builder-mvp-design.md).
Delivery order, acceptance, and progress live in the validation harness Feature
008 plan, specification, and tasks. No production implementation, deployment,
or owner acceptance is recorded by this handoff.

At freeze: GitHub reported no merge conflicts, no submitted reviews and no
inline review threads. UI and MVP assembly passed. Gateway could not launch
`pytest` or `mypy`; Agents and MCP were cancelled. The approved repair removes
the cached virtual environment and retains setup-uv download caching, so the
locked dependencies produce fresh launchers in the current checkout. This is a point-in-time
observation, not a permanent readiness label; use PR checks for current status.

## Saved-work extension awaiting review — 10 September 2026

The owner approved grouped Saved work and saved-SQL reuse in the current
harness delivery. The existing mock now demonstrates that bounded extension;
the frozen shell, palette, composer and Advanced mode remain the reference.
In the preview, choose **Saved queries and SQL reuse**. Review either saved
query, load its exact parameterized SQL and typed values, and explicitly keep
the current draft when starting a separate question. The source change is
visible before confirmation. The second example retains reusable SQL even
though its earlier result details are unavailable.

The loaded editor identifies the originating saved version and source. It
retrieves nothing until **Get results** is chosen, and that action still only
shows fictional mock rows. **Return to your earlier draft** restores the prior
question and SQL; retained drafts are also listed under **Change data**. This
uses temporary fixture state solely to review the interaction. Production must
use its existing session and browser-state owners, including persistence and
failure handling; no mock state code is an implementation prescription.

The interaction review is pending. Delivery acceptance remains in Feature 008
tasks; this does not record approval or start Dashboard implementation. The
multi-artifact, shared-control, Metabase and Evidence scenarios remain in their
scheduled follow-on milestones. Public preview synchronization follows review
and the compatible harness update.

## Delivery order

Use these as small reviewable portions of the existing UI effort, not a new
roadmap or an instruction to complete every Dashboard feature now.

| Order | Deliverable | Existing code to reuse | Minimum useful proof |
| --- | --- | --- | --- |
| 1 | Shared resizable question input with Expand/Restore; preserve initial and follow-up request handlers | `components/QuestionForm.tsx`, `components/TurnNotebook.tsx`, their tests and composer layout | Eight-line draft, resize/restore, retained input on failure, keyboard prepare, explicit Run still separate |
| 2 | Explore/Saved work shell, appearance tokens and View options with general Advanced mode | `QueryWorkspace.tsx`, `components/AskOpenElisNavigation.tsx`, `theme.ts`, `App.tsx`, existing Carbon and CodeMirror controls | Light/dark/system choice; one editor; mode switches preserve draft, SQL, parameters, source, result and selected profile |
| 3 | Complete, friendly schema browser usable while composing | Existing editor catalog, `components/DatasetBrowser.tsx`, source/schema state | All readable relations and fields; search names/descriptions/columns; no-match and failure recovery; browse/draft state and keyboard return; narrow layout |
| 4 | Result-first review, plain-language feedback, and consistent Saved work labels | `components/WorkbenchPanel.tsx`, `components/DashboardPublishPanel.tsx`, existing libraries and result table | Sole full table in review; visible errors/limits; retained provenance; save-to-dashboard path keeps existing identities and import receipts |

Component paths above are relative to `catalyst-ui/src/features/query/`, except
`App.tsx` in `catalyst-ui/src/`. The offline mock's fixture state is not production
code to port. Use the shared presentation/components and existing state owners.

## Authority alignment

The frozen navigation, composer, visibility and palette amendments have been
incorporated into the [current product specification](../../specification.md)
and [binding Dashboard Builder design](../../dashboard-builder-mvp-design.md).
Track implementation through the validation harness Feature 008 plan and tasks.
The [overlap review](overlap.md) remains dated evidence of the consolidation.

Follow the harness Feature 008 plan: approved usability first, then Dashboard
functionality after feedback on the local usability gate. Model comparison and
broader conversation remain separately scheduled. The final owner review still compares the live Workbench,
Dataset/Widget review and libraries, Dashboard arrangement, and publish/import
states with the binding reference.

## Findings to carry into implementation

- `DatasetBrowser.tsx` contains both complete catalog handling and a legacy row
  browser. Reuse the schema/catalog path for this companion; do not introduce
  row retrieval while drafting or infer clinical descriptions. Confirm the
  applicable retirement work against the current plan before broad cleanup.
- The current composer has automatic full/line/tucked behavior. Replace that
  behavior and its expectations deliberately; preserve draft and focus tests.
- The existing theme preference already supplies System/Light/Dark. Reuse it;
  do not create another preference service or copy the preview's storage key.
- The mock's three relations, successful saves and import states are fictional.
  They are layout evidence, not proof of catalog completeness or backend behavior.

## Validation and review

For each portion, update the affected component tests, then run the existing UI
checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and
`npx playwright test --project=deterministic` in `catalyst-ui`. Replace obsolete
visual/composer expectations intentionally; do not weaken behavioral assertions.

Browser review covers desktop and narrow widths, keyboard/focus, long drafts,
Light/Dark/System, complete schema access and simple/Advanced mode. Test against
both configured OpenELIS and OpenMRS sources using the harness's
`scripts/catalyst-mvp.sh` wrapper. Use retained data; reseeding/reset remains an
explicit operation. Live model/query/saving/import checks belong to the existing
integration acceptance path, not a new repeated-run matrix.

Before an owner review, report concrete unresolved behavior and environment
choices. Mock approval and green CI do not replace clinical/program staff and
analyst review of the implemented workflow.

## CI repair evidence at freeze

The failing [Gateway job](https://github.com/DIGI-UW/catalyst-ai/actions/runs/34424920844/job/102708005196)
restored an environment under `venv-Linux-catalyst-gateway-`: the intended
lockfile hash was empty. `uv sync` reported 58 packages checked, Ruff succeeded,
and both `pytest` and `mypy` failed to spawn before tests/type checks ran.

An isolated local relocation reproduced that exact sequence: installed Python
launchers retained the original absolute path; syncing did not repair them.
This supports stale cached paths as the cause, although the original GitHub
cache's launchers were not inspected. [Python documents environment non-portability](https://docs.python.org/3.11/library/venv.html#how-venvs-work).
The repair recreates the environment from the frozen lockfile in each checkout
while keeping setup-uv's download cache. No tests, dependency versions, or
existing pass/fail policies are changed.

Fresh local Python 3.11.16 environments produced:

| Component | Formatting/lint | Tests | Existing advisory type check |
| --- | --- | --- | --- |
| Gateway | Pass | 332 passed, 1 skipped | 10 errors in `analytics.py` and `service.py` |
| Agents | Pass | 31 passed | 13 errors across 5 files |
| MCP | Pass | 7 passed initially; the localhost test passed when rerun with port-binding permission | Pass |

The Python code and lockfiles match the PR's base `4c6a46f`. The type-check
findings are therefore existing debt; the workflow already treats mypy as
non-blocking. They remain visible rather than being fixed or suppressed in this
design/CI change. Hosted checks must still validate the final PR head; use their
live result for merge readiness. At the CI repair, the mock assets were byte-for-byte unchanged
from the frozen design commit, and handoff links/component paths were checked.

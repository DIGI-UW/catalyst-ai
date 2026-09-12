# The full-scenario demo: one spec, two modes

`catalyst-ui/e2e/full-scenario-demo.spec.ts` walks the accepted visible workflow
through the product's own path for both retained sources, OpenELIS and OpenMRS:
write a question while browsing the schema, prepare and explicitly execute it,
refine the result, save and reuse its exact SQL without losing a draft, recover
from a real database error in the copied SQL, create
a table and grouped-bar chart, and save and restore their Dashboard arrangement.
`Publish to Superset` writes the native bundle; the owning harness imports it,
and displayed Superset rows are compared with the originating Catalyst result.
The run also verifies light/dark appearance and the Advanced mode switch.

The visible Publish action is followed by one direct verification request that
asserts a repeated publication has the identical bundle digest. Query preparation
and execution use the visible interface. Each source's proof records its saved
versions, publication and originating execution. This is delivery evidence;
model comparison and owner acceptance remain separate.

It runs with or without recording holds:

| | project | video | dwells | what it is for |
|---|---|---|---|---|
| **e2e** | `deterministic` | off | none | does the whole path still work end to end |
| **video** | `demo-video` | 1280×720 | yes | raw footage for a published cut |

`dwell()` holds the frame long enough to read something and is a no-op outside
the video project. Set `CATALYST_DEMO_STORY=true` for the public walkthrough:
the model creates and refines SQL, then the user saves, reuses, visualizes and
publishes it. One brief OpenELIS follow-up asks the model to fix supplied broken
SQL. The public story never deliberately breaks a working query in the editor.
The default regression journey retains the database-error/retry assertions.
Both journeys run in either project and compare native Superset results with
the originating execution. The public story also requires recorded reviewer
decisions, visible review status, and execution of the model-authored version.
The gender breakdown must preserve the original totals (by month for OpenMRS).
This catches row multiplication from a join even when SQL executes successfully
and the reviewer approves it; it is not a general clinical-correctness verdict.

The live scenario has no internal deadline for model preparation, schema
loading, import, or rendering. It waits for the actual terminal state; the
person running it can use the visible Stop control for a request that should
not continue.

## Prerequisites

Start and check the isolated stack through the Clinical AI Validation Harness
operator wrapper. `up` retains the existing databases; do not use `boot`,
`seed`, or `reset` between takes:

```sh
cd <clinical-ai-validation-harness checkout>
./scripts/catalyst-mvp.sh up
./scripts/catalyst-mvp.sh health
```

The scenario gives every Dataset, Widget, and Dashboard a run-specific name,
so reruns are safe against the retained Dashboard Builder state. It does not
reset or reseed the stack. Omit `CATALYST_DEMO_RUN_ID` for the unique default;
if you set it for a named recording, use a fresh value for every take.

The same Harness checkout must own both the running Gateway and this run. Its
wrapper verifies the pinned Catalyst checkout and supplies the isolated
override, project name, ports, and sibling Hub context. This is why the demo
accepts the Harness root rather than reconstructing those settings itself.

## Running it

```sh
cd catalyst-ui

# as a test
PLAYWRIGHT_LIVE=true PLAYWRIGHT_USE_MOCK_API=false \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:13000 \
  CATALYST_HARNESS_DIR=<running clinical-ai-validation-harness checkout> \
  npx playwright test e2e/full-scenario-demo.spec.ts --project=deterministic --workers=1

# as a recording
…same env… npx playwright test e2e/full-scenario-demo.spec.ts \
  --project=demo-video --workers=1 --output=<private run directory>/capture
```

The spec runs the pinned importer itself (`e2e/support/superset-import.ts`)
through the Harness's supported `scripts/catalyst-mvp.sh superset-import`
wrapper. It requires healthy services in the owning checkout with matching
configuration and never starts or reconfigures them during import. The
"Superset bundle ready → Imported" change happens on camera, backed by the
actual importer receipt.

Run one worker because both sources share the operator's current outbox pointer.
Use `--grep openelis` or `--grep openmrs-hiv` to select one source. For server
evidence, run from the checkout owning that server's stack and use its public UI
and Superset URLs; importing the local outbox cannot prove the server workflow.

The selected output directory is **wiped by the next run**. Use a fresh private
directory per take and archive videos, traces, screenshots, `proof.json` and
`requests-and-results.json`. Milestones land in
`demo-milestones/full-scenario-<source>.json`, or `DEMO_MILESTONES_DIR` when set.
Author the timeline against those measured marks and the actual capture, then
render with the harness's `scripts/render_demo_video.py`; see its
`specs/demo-video-recording-guide.md`. Exclude Superset sign-in from the cut.

Keep captions/cards visible for at least five seconds (longer for longer text),
results/details for at least eight seconds, and reading/interactions at normal
speed. Label accelerated waits and preserve captions during holds. Keep the
FHIR Data Pipes introduction to about 10–15 seconds. Watch final cuts at normal
speed before publishing; raw evidence remains private.

## Environment

| variable | default | meaning |
|---|---|---|
| `PLAYWRIGHT_LIVE` | — | must be `true`; otherwise the spec skips |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:4173` | the Catalyst UI |
| `PLAYWRIGHT_SUPERSET_URL` | `http://127.0.0.1:18088` | Superset, including any hosted path prefix |
| `CATALYST_HARNESS_DIR` | — | required root of the Harness checkout that owns the running isolated stack |
| `CATALYST_DEMO_RUN_ID` | a random UUID | unique suffix for this run's retained builder artifacts |
| `CATALYST_DEMO_PROFILE` | configured UI default | optionally selects an explicit available profile; the session records the selection |
| `CATALYST_DEMO_STORY` | `false` | use the public story with one supplied-SQL repair across both sources; requires a reviewer profile |
| `DEMO_MILESTONES_DIR` | `demo-milestones` | private destination for each source's measured timings |
| `SUPERSET_ADMIN_USERNAME` / `_PASSWORD` | `admin` / `admin` | Superset sign-in |

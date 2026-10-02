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
Product milestones live in the [implementation register](../../specification.md#implementation-direction);
cross-project acceptance and order live in [OpenClinAI delivery](https://github.com/pmanko/openclinai.org/blob/main/specs/roadmap.md#6-catalyst-delivery). No production implementation, deployment,
or owner acceptance is recorded by this handoff.

At freeze: GitHub reported no merge conflicts, no submitted reviews and no
inline review threads. UI and MVP assembly passed. Gateway could not launch
`pytest` or `mypy`; Agents and MCP were cancelled. The approved repair removes
the cached virtual environment and retains setup-uv download caching, so the
locked dependencies produce fresh launchers in the current checkout. This is a point-in-time
observation, not a permanent readiness label; use PR checks for current status.

## Saved-work interaction handoff — 10 September 2026

The owner approved grouped Saved work and saved-SQL reuse on 10 September. The existing mock now demonstrates that bounded extension;
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

The current product authorities incorporate the accepted interactions. Use the
implementation and delivery registers linked above for remaining work. This dated
handoff records design and CI evidence only. The mock's fixture state and fictional
rows are not application code to port or proof of source completeness.

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

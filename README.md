# Catalyst

Catalyst is a supervised SQL workbench and dashboard builder. It helps a person
turn a question into reviewable SQL, run the exact selected query against a
configured data source, inspect rows or the database error, refine the query in
conversation, and publish saved results to Superset.

Catalyst is database- and ingestion-independent. A source supplies:

- a stable identity and label;
- connection configuration or a connection reference;
- an explicit SQL dialect; and
- every table, view, column, and type readable through that connection.

Optional descriptions may enrich the readable schema but cannot hide relations.

## Status

The query notebook, frozen staff Workbench design, and binding Dashboard Builder
design are accepted. The validation harness [Feature 008 task register](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/008-catalyst-query-workbench/tasks.md)
tracks implementation, merged revisions, deployment, and owner acceptance.

## Product flow

```text
question
  -> model receives declared dialect and complete readable schema
  -> person reviews or edits SQL
  -> exact selected SQL
  -> rows or database error
  -> saved Dataset
  -> reviewed Widget
  -> Dashboard
  -> native Superset bundle and rendered dashboard
```

med-agent-hub owns configured model profiles, prompts, role-to-model mapping, and
model settings. Catalyst owns model-request assembly, conversation and query
versions, advisory validation, connection execution, results, Dataset/Widget/
Dashboard state, and Superset bundle publication.

A session binds one source. Selecting another source starts another session.

## Selected reference deployment

The selected demonstration will use retained demo data through this path:

```text
OpenELIS or OpenMRS FHIR
  -> FHIR Data Pipes
  -> Parquet and applicable ViewDefinitions
  -> Spark SQL
  -> Catalyst and Superset as SQL clients
```

Implementation and acceptance of this deployment are open. It is not a Catalyst
product requirement. OpenELIS deployment assets are packaged under
`analytics/` for convenience. Their ingestion and Spark configuration are not
part of Catalyst core.

## Execution boundary

Validation is advisory. Findings never disable Run or rewrite selected SQL.
Generated and manually edited queries use the same connection-execution code.

Catalyst relies on the configured connection's access, applies a time limit and
returned-row limit, and records typed rows or the error returned by the database.
The demo Spark path must visibly refuse one intentional write attempt and leave
source data unchanged. Production authentication, authorization, row-level
access, and sensitive-data controls are later work.

## Dashboard Builder

The binding product contract is
[docs/dashboard-builder-mvp-design.md](docs/dashboard-builder-mvp-design.md).
The approved visual reference is the
[staff Workbench preview](docs/specs/staff-workbench-ux/index.html).

Phase 1 connection work includes one Dataset-to-Superset regression smoke. Final
Dashboard Builder acceptance remains a later product phase and requires a
side-by-side browser comparison of the live Workbench, Dataset review/library,
Widget review/library, Dashboard library/arrangement, and publish/import states
with the binding design.

Superset is the renderer. Catalyst publishes a deterministic native bundle to an
outbox and uses explicit importer receipts for status. Catalyst does not build a
second chart runtime, embed result rows in bundles, or open a second database
execution path.

For a shared host, set `SUPERSET_APP_ROOT` to a path such as
`/catalyst-dashboards` and `CATALYST_SUPERSET_PUBLIC_URL` to its full public URL
in the deployment's `.env`. Preserve that prefix at the reverse proxy. The
renderer, health checks and imported Dashboard links use these settings; leave
both empty for the ordinary local URLs. Continue to run lifecycle and import
operations through the harness wrapper from the checkout owning the deployment.
Import requires healthy Spark and Superset services with the same configuration
as the running stack. It does not start, restart or reconfigure them. If settings
differ, retry with the existing settings or deliberately update the stack with
the lifecycle wrapper before importing.

## Documentation

- [Product specification](docs/specification.md)
- [Historical product roadmap](docs/roadmap.md)
- [Dashboard Builder design](docs/dashboard-builder-mvp-design.md)
- [med-agent-hub client contract](docs/med-agent-hub.md)
- [Development instructions](AGENTS.md)

These files contain the current requirements.

The [frozen staff Workbench design and interactive mock](docs/specs/staff-workbench-ux/spec.md)
are dated design evidence. Their accepted behavior is incorporated in the
product specification and binding design.

## Repository layout

- `catalyst-gateway/` — model request, connection, query, result, and dashboard
  HTTP behavior.
- `catalyst-ui/` — React/Carbon query notebook and Dashboard Builder.
- `analytics/` — OpenELIS reference-deployment assets; not Catalyst core.
- `docs/` — current product requirements and contracts.
- `scripts/` — development and reference-stack helpers.
- `tests/` — focused contract and integration tests.
- `catalyst-agents/` and `catalyst-mcp/` — experimental components outside the
  active Gateway and UI flow; Catalyst core does not require them.

## Development

Requirements: Python 3.11, [uv](https://docs.astral.sh/uv/), Node.js 22, Docker,
and Docker Compose v2.20 or newer.

```bash
cp env.recommended .env
mkdir -p logs
cd catalyst-gateway && uv sync --frozen --extra dev && cd ..
cd catalyst-ui && npm ci && cd ..
```

Run focused tests for the component being changed. Use the validation harness's
`scripts/catalyst-mvp.sh` wrapper for the combined reference deployment; do not
invoke the Catalyst Compose file alone for cross-repository acceptance.

The selected reference deployment requires one live FHIR Data Pipes -> Parquet
-> Spark -> Catalyst proof for each reference source actually included. Ordinary unrelated
pull requests do not require a live Spark service, reseeding, restart-persistence
proof, environment parity, repeated model runs, or direct database
reconciliation.

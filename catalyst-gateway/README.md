# Catalyst Gateway

The Gateway owns Catalyst's governed-query orchestration, read-only execution,
lineage, and Dashboard Builder APIs. It invokes role models only through a
named med-agent-hub query profile; it does not expose a generic chat-completion
relay or call a model router directly.

See the repository
[product specification](../docs/specification.md),
[roadmap](../docs/roadmap.md), and
[hub client contract](../docs/med-agent-hub.md).

Use `uv sync` to set up dependencies.

## PostgreSQL sources

Register an additional source using the existing `CATALYST_DATA_SOURCES_PATH`
JSON file. For example (replace the placeholders; keep real credentials out of
Git):

```json
{"dataSources":[{"id":"openelis-postgres","label":"OpenELIS","dialect":"postgres","connectionUri":"postgresql://USER:PASSWORD@HOST:5432/DATABASE"}]}
```

Use a database role with only the required read grants. Percent-encode URI
credentials and use the connection's PostgreSQL SSL options when required.
`postgresql` is also accepted as a dialect name. This adds a source without
retargeting existing sessions or replacing the Spark source.

Publication resolves each Dataset's own source. Set optional
`supersetSqlalchemyUri` on a source when Superset needs a different hostname,
port or driver. Otherwise PostgreSQL uses the query URI with the
`postgresql+psycopg2` driver and Spark uses `hive`. These addresses must resolve
from Superset's network and address the same underlying data. The legacy
`CATALYST_SUPERSET_ANALYTICS_URI` applies only to the default source;
`CATALYST_ANALYTICS_DATABASE_URI` no longer overrides imported bundles.

New saved Datasets record a credential-free publication-connection identity.
Changing its endpoint, database, account or options requires restoring the
configuration or explicitly executing and saving a new Dataset. New identities
get different Superset database UUIDs, preserving earlier dashboards. A matching
existing UUID with a different URI fails before import instead of being changed.
For credential rotation, reconcile the existing Superset connection explicitly
before retrying. The manifest contains no connection URI; URI passwords are
redacted from importer diagnostics.
The protected native bundle still includes its connection URI under the existing
local-demo credential policy.

Legacy Dataset versions retain their compiled SQL and database UUID. They lack
a recorded connection identity, so their original configuration must be retained;
the importer still refuses to redirect an existing UUID. This is publication
support, not proof of a deployed reporting-source journey.

The shared adapter exposes readable catalog metadata, preserves database result
types, starts execution in a read-only transaction and sets `statement_timeout`.
Row bounds limit returned results, not the server's scan. Role permissions remain
the authorization boundary; advisory validation is not a write-permission gate.

Gateway CI runs the PostgreSQL tests against a disposable PostgreSQL 16 service.
For local integration tests, set `CATALYST_TEST_POSTGRES_URI` to an **isolated test
database** whose test administrator may create roles and schemas, then run:

```bash
PYTHONPATH=. uv run pytest tests/test_postgres_analytics.py
```

The fixture creates a uniquely named reader role and schema and removes both.
Do not point it at an application or clinical database.

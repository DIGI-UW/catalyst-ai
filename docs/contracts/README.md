# Catalyst machine contracts

The JSON schemas in this directory describe formats used by the current running
code. They are executable interface definitions, not a second product roadmap.

The running wire formats include catalog, dialect, guidance and source/version
provenance. Change schemas and their consumers together; do not infer working
engine transport from the presence of a dialect field. The
[Dashboard Builder contract](dashboard-builder-api.md) distinguishes the current
query-backed HTTP surface from the additive imported-Dataset routes and their
origin-specific provenance. Product requirements are stated in the documents below.

Current intended behavior is stated in:

- [the Catalyst specification](../specification.md);
- [the Catalyst roadmap](../roadmap.md);
- [the Dashboard Builder contract](dashboard-builder-api.md); and
- [the accepted Dashboard Builder design](../dashboard-builder-mvp-design.md).

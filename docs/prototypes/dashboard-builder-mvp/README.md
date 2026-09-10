# Dashboard Builder MVP interactive references

These static pages are interactive design references, not production
application code. `Catalyst Dashboard Builder 4c.dc.html` is the populated
binding Workbench state: latest instruction → one active SQL workbench → Dataset
tile after explicit successful Run → Dataset review panel.

From the Catalyst repository root, run:

```bash
scripts/serve-dashboard-prototype.sh
```

Then open:

- <http://127.0.0.1:18443/Catalyst%20Dashboard%20Builder%204c.dc.html>
- <http://127.0.0.1:18443/Catalyst%20Query%20Screen.dc.html>
- <http://127.0.0.1:18443/Dashboard%20Builder%20Wireframes.dc.html>

Set `CATALYST_DASHBOARD_PROTOTYPE_PORT` to use another localhost port.

The normative design text and acceptance gate live in
`docs/dashboard-builder-mvp-design.md`.

Reference priority:

1. The written invariants in `docs/dashboard-builder-mvp-design.md`.
2. The running current Catalyst query workbench and its tests for SQL editing,
   Format/Validate/Run, evidence, versions, restoration, and result semantics.
3. The populated binding 4c page for chronology, Dataset/Widget tiles, panels,
   libraries, arrangement, and publication. Its older shell, fixed composer,
   palette, and compact Available data treatment are superseded by the written
   contract and frozen staff Workbench evidence.
4. `Catalyst Query Screen.dc.html` and the wireframes as supporting,
   non-binding explorations.

The populated 4c reference deliberately shows:

- one editable SQL surface and one page-header New session action;
- a profile selector that moves into Query settings and technical details in the
  accepted Workbench presentation;
- Available data backed by the runtime catalog/full source browser rather than
  a static cohort table; the accepted implementation is a nonmodal companion;
- Format, Validate, explicit Run, typed parameters, staleness, and inspectable
  generation/failure evidence;
- no inline result-row table; the Dataset panel owns the bounded typed table,
  truncation/null feedback, and paging; and
- no example prompts in the empty state.

The prototype uses representative state and rows. It is not evidence that API,
persistence, execution, Superset import, accessibility, or error recovery is
implemented; those require product tests and live acceptance.

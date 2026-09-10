# Catalyst UI

Vite/React sidecar for the governed Catalyst question → preview → accepted
execution → typed table workflow. The UI always calls the same-origin
`/v1/catalyst` API; the production Nginx image proxies that path to
`catalyst-gateway:8000`, so browser CORS configuration is not required.

## Using the workspace

Start in **Explore** to write a question, then choose **Get results** when the
prepared query is ready to run. **Saved work** groups Saved queries, Charts and
tables, and Dashboards. The source/session control opens existing sessions or
starts a new one with another source.

**View options** contains System/Light/Dark appearance and **Advanced mode**.
Advanced mode exposes SQL and query settings across the workspace; switching
presentation retains drafts and results. In the simple view, **Query settings**
and **View or edit SQL** keep those controls available when needed.

The [approved design](../docs/specs/staff-workbench-ux/index.html) is the visual
reference. Current iteration and deployment status lives in the harness
[Feature 008 task register](https://github.com/pmanko/clinical-ai-validation-harness/blob/main/specs/008-catalyst-query-workbench/tasks.md).

**Available data** opens a companion browser alongside your question. Search
all readable table/view names, field names, types and supplied descriptions;
expand an item for its exact fields. Browsing fetches schema metadata only.
Close/reopen retains your search and expanded items; another source starts a
fresh browser context. **Back to your question** returns focus without closing
it, and **Try again** retries a failed schema load without changing your draft.

After a run, choose **Review results** to inspect the full table, field types,
limits and warnings. **Technical details** contains the exact SQL, parameters
and recorded model information. Earlier results remain available, but only the
current successful result can **Save query**. Saved queries then offer
**Create a chart or table**.

## Local commands

```bash
npm ci
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
```

## Browser tests

The `deterministic` Playwright project intercepts the Catalyst API. The
`demo-video` project also uses deterministic responses by default and always
records video, traces, and screenshots.

```bash
npx playwright install chromium
npm run test:e2e -- --project=deterministic
npm run test:e2e -- --project=demo-video
```

Set `PLAYWRIGHT_BASE_URL` to run against a deployed UI, `PLAYWRIGHT_QUERY` to
override the golden question, and `PLAYWRIGHT_USE_MOCK_API=false` to exercise
the deployed same-origin Catalyst API in the `demo-video` project.

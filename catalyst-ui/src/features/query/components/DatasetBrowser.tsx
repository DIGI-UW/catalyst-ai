import { Disclosure } from "./Disclosure";
import { Accordion, AccordionItem, Button, InlineLoading, Pagination, Search } from "@carbon/react";
import { useMemo, useState } from "react";
import type { WorkbenchEditorCatalog } from "../types";
import "./DatasetBrowser.css";

interface DatasetBrowserProps {
  catalog: WorkbenchEditorCatalog | null;
  catalogLoading?: boolean;
  catalogLoadingFailed?: boolean;
  onRetry?: () => void;
  advancedMode?: boolean;
}

/** The browser reads the same complete catalog as SQL completion. It never reads source rows. */
export const DatasetBrowser = ({
  catalog,
  catalogLoading = false,
  catalogLoadingFailed = false,
  onRetry,
  advancedMode = false,
}: DatasetBrowserProps) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const relations = useMemo(() => (catalog?.schemas ?? [])
    .flatMap((schema) => schema.views)
    .sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName)), [catalog]);
  const query = search.trim().toLowerCase();
  const matches = relations.filter((view) => [view.name, view.qualifiedName, view.grain,
    ...view.columns.flatMap((column) => [column.name, column.description, column.logicalType])]
    .some((text) => text?.toLowerCase().includes(query)));
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(matches.length / pageSize)));
  const visible = matches.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);

  return (
    <div className="dataset-browser">
      <Search id="available-data-search" labelText="Search tables and fields" placeholder="Search tables and fields"
        value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }}
        onClear={() => { setSearch(""); setPage(1); }} size="lg" />
      {catalogLoading && <InlineLoading description="Loading available data…" />}
      {catalogLoadingFailed && <div role="status" className="dataset-browser__message">
        <p>We couldn’t load the tables and fields. Your question is still here.</p>
        {onRetry && <Button kind="tertiary" size="sm" onClick={() => { onRetry(); document.getElementById("available-data-search")?.focus(); }}>Try again</Button>}
      </div>}
      {!catalog && !catalogLoading && !catalogLoadingFailed &&
        <p className="dataset-browser__message">Schema browsing is unavailable for this connection.</p>}
      {catalog && <>
        <p className="dataset-browser__count" role="status">
          {query ? `${matches.length} of ${relations.length} tables and views match` : `${relations.length} tables and views`}
        </p>
        {relations.length === 0 && <p>No readable tables or views were returned by this connection.</p>}
        {relations.length > 0 && matches.length === 0 && <p>No matches. Try another name or clear the search to browse everything.</p>}
        <Accordion align="start">
          {visible.map((view) => <AccordionItem key={view.qualifiedName}
            title={<span className="dataset-browser__relation-name"><strong>{view.qualifiedName}</strong><small>{view.columns.length} fields</small></span>}
            open={expanded[view.qualifiedName] ?? Boolean(query)}
            onHeadingClick={({ isOpen }) => setExpanded((current) => ({ ...current, [view.qualifiedName]: isOpen }))}>
            {view.grain && <p className="dataset-browser__description">{view.grain}</p>}
            {view.columns.length === 0 ? <p>No fields were returned for this item.</p> :
              <dl className="dataset-browser__fields">
                {view.columns.map((column) => <div key={column.name}>
                  <dt><code>{column.name}</code><span>{column.logicalType}</span></dt>
                  <dd>
                    {column.description && <p>{column.description}</p>}
                    <small>{column.nullable ? "May be empty" : "Cannot be empty"}
                      {column.unitColumn && <> · Unit from <code>{column.unitColumn}</code></>}
                    </small>
                    {column.databaseType && column.databaseType !== column.logicalType &&
                      <Disclosure open={advancedMode} title="Database type"><code>{column.databaseType}</code></Disclosure>}
                  </dd>
                </div>)}
              </dl>}
          </AccordionItem>)}
        </Accordion>
        {matches.length > 10 && <Pagination page={visiblePage} pageSize={pageSize} pageSizes={[10, 25, 50]}
          totalItems={matches.length} itemsPerPageText="Items per page"
          onChange={({ page: nextPage, pageSize: nextSize }) => { setPage(nextPage); setPageSize(nextSize); }} />}
        <Disclosure className="dataset-browser__technical" open={advancedMode} title="Schema details">
          <dl><dt>SQL dialect</dt><dd>{catalog.dialect}</dd>
            <dt>Catalog version</dt><dd>{catalog.catalogVersion}</dd>
            <dt>Schema version</dt><dd>{catalog.schemaVersion}</dd></dl>
        </Disclosure>
      </>}
    </div>
  );
};

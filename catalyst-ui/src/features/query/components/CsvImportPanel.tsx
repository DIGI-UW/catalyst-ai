import { Button, FileUploaderButton, InlineNotification, Select, SelectItem, TextInput } from "@carbon/react";
import { useEffect, useRef, useState } from "react";
import type { CatalystApi } from "../api";
import type { CsvImportDraft, DashboardBuilderEntity, ImportedRows } from "../types";
import { Disclosure } from "./Disclosure";
import { TypedRowsTable } from "./TypedRowsTable";

const draftKey = "catalyst.csv-import-draft";
const message = (error: unknown) => error instanceof Error ? error.message : "Could not complete the import. Your draft is still here.";

export const CsvImportPanel = ({ api, visible, onClose, onSaved }: {
  api: CatalystApi; visible: boolean; onClose: () => void; onSaved: (dataset: DashboardBuilderEntity) => void;
}) => {
  const [draft, setDraft] = useState<CsvImportDraft | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(() => Boolean(sessionStorage.getItem(draftKey) && api.reviewCsvImport));
  const [error, setError] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restoreStarted = useRef(false);

  useEffect(() => {
    if (!visible) return;
    titleRef.current?.focus();
    if (restoreStarted.current || !api.reviewCsvImport) return;
    restoreStarted.current = true;
    const importId = sessionStorage.getItem(draftKey);
    if (!importId) return;
    void api.reviewCsvImport(importId).then(restored => {
      if (restored.datasetVersionId) { sessionStorage.removeItem(draftKey); return; }
      setDraft(restored); setTitle(restored.title);
    }).catch(caught => setError(message(caught))).finally(() => setBusy(false));
  }, [visible, api]);

  const upload = async (selected: File) => {
    if (!api.uploadCsv) return;
    setFile(selected); setBusy(true); setError(null); setUploadFailed(false);
    try {
      const uploaded = await api.uploadCsv(selected);
      setDraft(uploaded); setTitle(uploaded.title);
      sessionStorage.setItem(draftKey, uploaded.importId);
    } catch (caught) { setError(message(caught)); setUploadFailed(true); }
    finally { setBusy(false); }
  };
  const review = async (types: CsvImportDraft["types"]) => {
    if (!draft || !api.updateCsvImport) return;
    setBusy(true); setError(null);
    try { setDraft(await api.updateCsvImport(draft.importId, { title, types })); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  };
  const page = async (offset: number) => {
    if (!draft || !api.reviewCsvImport) return;
    setBusy(true); setError(null);
    try { setDraft(await api.reviewCsvImport(draft.importId, offset)); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!draft || !api.updateCsvImport || !api.confirmCsvImport) return;
    setBusy(true); setError(null);
    try {
      const current = await api.reviewCsvImport?.(draft.importId);
      const reviewed = current?.datasetVersionId ? current : await api.updateCsvImport(draft.importId, { title, types: draft.types });
      setDraft(reviewed);
      if (reviewed.error) return;
      const saved = await api.confirmCsvImport(draft.importId);
      sessionStorage.removeItem(draftKey);
      setDraft(null); setFile(null); setTitle("");
      onSaved(saved);
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  };
  return <section className="builder-library builder-import" hidden={!visible} aria-labelledby="import-title">
    <header className="builder-library__header"><div>
      <p className="eyebrow">Saved work · Datasets</p>
      <h1 id="import-title" ref={titleRef} tabIndex={-1}>Bring your report with you</h1>
      <p>Upload a CSV, check its columns, and save it for charts and dashboards.</p>
    </div></header>
    <Button kind="ghost" onClick={onClose}>Back to Datasets</Button>
    <div className="builder-saved-card builder-import__content">
      <h2>{draft ? "Review your file" : "Choose a CSV"}</h2>
      <FileUploaderButton id="csv-file" labelText={draft ? "Choose another CSV" : "Choose CSV"}
        accept={[".csv", "text/csv"]} multiple={false} disabled={busy} disableLabelChanges
        onChange={event => { const selected = event.currentTarget.files?.[0]; if (selected) void upload(selected); }} />
      <p className="builder-import__help">UTF-8 CSV · Up to 10 MB and 100,000 rows. Your original values are kept while you review types.</p>
      {busy && <p role="status">{draft ? "Updating your import…" : "Reading your file…"}</p>}
      {error && <InlineNotification kind="error" title="Import needs attention" subtitle={error} lowContrast hideCloseButton />}
      {uploadFailed && file && <Button disabled={busy} onClick={() => void upload(file)}>Retry upload</Button>}
      {draft && <>
        <p><strong>{draft.filename}</strong> · {draft.preview.rowCount.total.toLocaleString()} complete rows · {draft.preview.columns.length} columns</p>
        <TextInput id="csv-title" labelText="Dataset name" value={title} disabled={busy}
          onChange={event => setTitle(event.currentTarget.value)} />
        <h3>Check the column types</h3>
        <p className="builder-import__help">Keep identifiers and mixed values such as “&lt;20” as Text. Blank values and repeated result rows are retained.</p>
        <div className="builder-import__columns">{draft.preview.columns.map((column, index) => <Select
          key={column.ordinal} id={`csv-type-${column.ordinal}`} labelText={`${index + 1}. ${column.name}`}
          value={draft.types[index]} disabled={busy}
          onChange={event => { const types = [...draft.types]; types[index] = event.currentTarget.value as CsvImportDraft["types"][number]; void review(types); }}>
          <SelectItem value="text" text="Text" /><SelectItem value="number" text="Number" /><SelectItem value="date" text="Date" />
        </Select>)}</div>
        {draft.error && <InlineNotification kind="error" title="Review this column type" subtitle={draft.error} lowContrast hideCloseButton />}
        <TypedRowsTable columns={draft.preview.columns} rows={draft.preview.rows} caption="CSV preview" />
        {draft.preview.rowCount.total > 100 && <nav className="workbench-execution__pagination" aria-label="CSV preview pages">
          <p>Showing {(draft.preview.offset ?? 0) + 1}–{(draft.preview.offset ?? 0) + draft.preview.rows.length} of {draft.preview.rowCount.total.toLocaleString()} rows</p>
          <Button kind="ghost" disabled={busy || !draft.preview.offset} onClick={() => void page(Math.max(0, (draft.preview.offset ?? 0) - 100))}>Previous preview page</Button>
          <Button kind="ghost" disabled={busy || !draft.preview.rowCount.truncated} onClick={() => void page((draft.preview.offset ?? 0) + 100)}>Next preview page</Button>
        </nav>}
        <Disclosure title="File details"><p>Complete file · {draft.preview.rowCount.total.toLocaleString()} rows · SHA-256</p>
          <code className="builder-import__checksum">{draft.sha256}</code>
          <p>Saving creates a separate version. Another upload will not replace a saved Dataset or published dashboard.</p>
        </Disclosure>
        <div className="builder-saved-card__actions">
          <Button disabled={busy || uploadFailed || Boolean(draft.error)} onClick={() => void save()}>{busy ? "Saving…" : "Confirm import and save Dataset"}</Button>
          <Button kind="tertiary" onClick={onClose}>Keep draft and return</Button>
        </div>
      </>}
    </div>
  </section>;
};

export const ImportedDatasetReview = ({ api, dataset }: { api: CatalystApi; dataset: DashboardBuilderEntity }) => {
  const [rows, setRows] = useState<ImportedRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const origin = dataset.configuration.origin as Record<string, unknown>;
  useEffect(() => {
    const controller = new AbortController();
    const request = api.getImportedRows?.(dataset.versionId, offset, controller.signal) ?? Promise.reject(new Error("Saved file review is unavailable."));
    void request.then(result => {
      if (!controller.signal.aborted) setRows(result);
    }).catch(caught => { if (!controller.signal.aborted) setError(message(caught)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [api, dataset.versionId, offset, retry]);
  return <div className="builder-import-review">
    <h3>{String(dataset.configuration.title)}</h3>
    <p>Imported CSV · {String(origin.filename)} · {Number(origin.rowCount).toLocaleString()} complete rows</p>
    <p>Saved version {dataset.ordinal}. Later uploads do not change these values.</p>
    {busy && <p role="status">Loading saved rows…</p>}
    {error && <><InlineNotification kind="error" lowContrast hideCloseButton title="Rows could not be loaded" subtitle={error} /><Button onClick={() => { setBusy(true); setError(null); setRetry(value => value + 1); }}>Retry loading rows</Button></>}
    {rows && !error && !busy && <><TypedRowsTable columns={rows.columns} rows={rows.rows} caption="Imported Dataset rows" />
      <nav className="workbench-execution__pagination" aria-label="Imported result pages">
        <p>Showing {offset + 1}–{offset + rows.rows.length} of {rows.rowCount.total.toLocaleString()} rows</p>
        {rows.rowCount.total > 100 && <><Button kind="ghost" disabled={busy || offset === 0} onClick={() => { setBusy(true); setError(null); setOffset(value => Math.max(0, value - 100)); }}>Previous result page</Button>
        <Button kind="ghost" disabled={busy || offset + rows.rows.length >= rows.rowCount.total} onClick={() => { setBusy(true); setError(null); setOffset(value => value + 100); }}>Next result page</Button></>}
      </nav></>}
    <Disclosure title="File details"><dl className="builder-review__metrics">
      <div><dt>Original file</dt><dd>{String(origin.filename)}</dd></div>
      <div><dt>File checksum (SHA-256)</dt><dd>{String(origin.sha256)}</dd></div>
      <div><dt>File size</dt><dd>{Number(origin.bytes).toLocaleString()} bytes</dd></div>
      <div><dt>Saved</dt><dd>{new Date(dataset.createdAt).toLocaleString()}</dd></div>
    </dl></Disclosure>
  </div>;
};

import { useCallback, useEffect, useState } from "react";
import type { CatalystApi } from "../api";
import type { BoundParameter, WorkbenchEditorCatalog } from "../types";

/**
 * The editor buffer: the SQL and parameters being drafted, the catalog that
 * grounds completion, and the editor's own chrome (wrap, focus, open).
 *
 * One of five hooks extracted from QueryWorkspace. The buffer is what the
 * person is writing; whether it counts as an edit is judged elsewhere
 * (editorDigest), and what running it means is a workflow the component
 * composes — this hook owns where the draft lives.
 */
export const useEditorBuffer = (api: CatalystApi, dataSourceId: string) => {
  const [sql, setSql] = useState("");
  const [parameters, setParameters] = useState<BoundParameter[]>([]);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogState, setCatalogState] = useState<{
    sourceId: string;
    attempt: number;
    catalog: WorkbenchEditorCatalog | null;
    failed: boolean;
  } | null>(null);
  const catalogCurrent = catalogState?.sourceId === dataSourceId && catalogState.attempt === catalogAttempt;
  const catalog = catalogCurrent ? catalogState.catalog : null;
  const catalogFailed = catalogCurrent && catalogState.failed;
  const catalogLoading = Boolean(api.getWorkbenchCatalog) && !catalogCurrent;
  const reloadCatalog = useCallback(() => setCatalogAttempt((attempt) => attempt + 1), []);
  const [wrapLines, setWrapLines] = useState(true);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!api.getWorkbenchCatalog) return;
    const controller = new AbortController();
    api.getWorkbenchCatalog(dataSourceId || undefined, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setCatalogState({ sourceId: dataSourceId, attempt: catalogAttempt, catalog: loaded, failed: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCatalogState({ sourceId: dataSourceId, attempt: catalogAttempt, catalog: null, failed: true });
        }
      });
    return () => controller.abort();
  }, [api, dataSourceId, catalogAttempt]);

  return {
    sql,
    setSql,
    parameters,
    setParameters,
    catalog,
    catalogFailed,
    catalogLoading,
    reloadCatalog,
    wrapLines,
    setWrapLines,
    focusRequestId,
    setFocusRequestId,
    editorOpen,
    setEditorOpen,
  };
};

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalystApi } from "../api";
import type { WorkbenchEditorCatalog } from "../types";
import { useEditorBuffer } from "./useEditorBuffer";

const catalog = (name: string): WorkbenchEditorCatalog => ({
  contractVersion: "catalyst.workbench.editor-catalog.v1", catalogVersion: name,
  schemaVersion: "v1", dialect: "spark", schemas: [],
});
const api = (): CatalystApi => ({ submitQuestion: vi.fn(), executePreview: vi.fn(), pollExecution: vi.fn() });
const deferred = () => {
  let resolve!: (catalog: WorkbenchEditorCatalog) => void;
  const promise = new Promise<WorkbenchEditorCatalog>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("source-bound schema loading", () => {
  it("clears the old schema immediately when another source is selected", async () => {
    const next = deferred();
    const client = { ...api(), getWorkbenchCatalog: vi.fn().mockResolvedValueOnce(catalog("OpenELIS")).mockReturnValueOnce(next.promise) };
    const { result, rerender } = renderHook(({ source }) => useEditorBuffer(client, source), { initialProps: { source: "openelis" } });
    await waitFor(() => expect(result.current.catalog?.catalogVersion).toBe("OpenELIS"));
    rerender({ source: "openmrs" });
    expect(result.current.catalog).toBeNull();
    expect(result.current.catalogLoading).toBe(true);
    await act(async () => next.resolve(catalog("OpenMRS")));
    expect(result.current.catalog?.catalogVersion).toBe("OpenMRS");
  });

  it("ignores a late response from the previous source even if the client ignores abort", async () => {
    const first = deferred();
    const second = deferred();
    const client = { ...api(), getWorkbenchCatalog: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) };
    const { result, rerender } = renderHook(({ source }) => useEditorBuffer(client, source), { initialProps: { source: "openelis" } });
    rerender({ source: "openmrs" });
    await act(async () => second.resolve(catalog("OpenMRS")));
    await act(async () => first.resolve(catalog("OpenELIS")));
    expect(result.current.catalog?.catalogVersion).toBe("OpenMRS");
  });

  it("retries schema retrieval without changing the SQL draft or parameters", async () => {
    const client = { ...api(), getWorkbenchCatalog: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(catalog("OpenELIS")) };
    const { result } = renderHook(() => useEditorBuffer(client, "openelis"));
    await waitFor(() => expect(result.current.catalogFailed).toBe(true));
    act(() => {
      result.current.setSql("SELECT :minimum");
      result.current.setParameters([{ name: "minimum", type: "number", value: 42, source: "human" }]);
      result.current.reloadCatalog();
    });
    await waitFor(() => expect(result.current.catalog?.catalogVersion).toBe("OpenELIS"));
    expect(result.current.catalogFailed).toBe(false);
    expect(result.current.catalog?.catalogVersion).toBe("OpenELIS");
    expect(result.current.sql).toBe("SELECT :minimum");
    expect(result.current.parameters[0]?.value).toBe(42);
  });
});

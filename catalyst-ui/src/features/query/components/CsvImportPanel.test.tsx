import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { CatalystApi } from "../api";
import type { CsvImportDraft, DashboardBuilderEntity } from "../types";
import { CsvImportPanel, ImportedDatasetReview } from "./CsvImportPanel";

const draft: CsvImportDraft = {
  importId: "import-1", filename: "results.csv", sha256: "a".repeat(64), bytes: 35,
  title: "results", types: ["text", "text"], error: null, datasetVersionId: null,
  preview: { columns: [{ ordinal: 0, name: "Accession", logicalType: "string" }, { ordinal: 1, name: "Result", logicalType: "string" }],
    rows: [[{ type: "string", value: "001" }, { type: "string", value: "<20" }]],
    rowCount: { total: 1, returned: 1, truncated: false }, offset: 0 },
};
const saved: DashboardBuilderEntity = {
  id: "import-1", versionId: "dataset-1", ordinal: 1, configurationDigest: "a".repeat(64), createdAt: "2026-09-14T12:00:00Z",
  configuration: { title: "Reviewed report", origin: { kind: "file", filename: "results.csv", sha256: draft.sha256, bytes: 35, rowCount: 1 } },
};
const makeApi = () => ({
  uploadCsv: vi.fn().mockResolvedValue(draft),
  reviewCsvImport: vi.fn().mockResolvedValue(draft),
  updateCsvImport: vi.fn().mockImplementation(async (_id, values) => ({ ...draft, ...values })),
  confirmCsvImport: vi.fn().mockResolvedValue(saved),
  getImportedRows: vi.fn().mockResolvedValue(draft.preview),
} as unknown as CatalystApi);
const chooseFile = () => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["Accession,Result\n001,<20\n"], "results.csv", { type: "text/csv" })] } });
beforeEach(() => sessionStorage.clear());

it("retains the reviewed file and name across navigation and save failure, then explicitly retries", async () => {
  const user = userEvent.setup(); const api = makeApi(); const onSaved = vi.fn(); const onClose = vi.fn();
  vi.mocked(api.confirmCsvImport!).mockRejectedValueOnce(new Error("Storage unavailable"));
  const view = render(<CsvImportPanel api={api} visible onClose={onClose} onSaved={onSaved} />);
  chooseFile();
  await screen.findByLabelText("Dataset name");
  expect(api.confirmCsvImport).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Dataset name"));
  await user.type(screen.getByLabelText("Dataset name"), "Reviewed report");
  view.rerender(<CsvImportPanel api={api} visible={false} onClose={onClose} onSaved={onSaved} />);
  view.rerender(<CsvImportPanel api={api} visible onClose={onClose} onSaved={onSaved} />);
  expect(screen.getByLabelText("Dataset name")).toHaveValue("Reviewed report");
  expect(screen.getByRole("cell", { name: "001" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Confirm import and save Dataset" }));
  await screen.findByText("Storage unavailable");
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Dataset name")).toHaveValue("Reviewed report");
  await user.click(screen.getByRole("button", { name: "Confirm import and save Dataset" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  expect(api.uploadCsv).toHaveBeenCalledTimes(1);
  expect(api.confirmCsvImport).toHaveBeenCalledTimes(2);
});

it("shows type errors with original values and prevents confirmation until corrected", async () => {
  const user = userEvent.setup(); const api = makeApi();
  vi.mocked(api.updateCsvImport!).mockImplementation(async (_id, input) => ({ ...draft, ...input, error: input.types[1] === "number" ? "Result row 1 is not a valid number. Choose Text." : null }));
  render(<CsvImportPanel api={api} visible onClose={vi.fn()} onSaved={vi.fn()} />);
  chooseFile(); await screen.findByLabelText("2. Result");
  await user.selectOptions(screen.getByLabelText("2. Result"), "number");
  await screen.findByText("Result row 1 is not a valid number. Choose Text.");
  expect(screen.getByRole("cell", { name: "<20" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm import and save Dataset" })).toBeDisabled();
  expect(api.confirmCsvImport).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("2. Result"), "text");
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirm import and save Dataset" })).toBeEnabled());
});

it("recovers a confirmed save after its response was lost without uploading or changing it again", async () => {
  sessionStorage.setItem("catalyst.csv-import-draft", draft.importId);
  const user = userEvent.setup(); const api = makeApi(); const onSaved = vi.fn();
  vi.mocked(api.reviewCsvImport!).mockResolvedValueOnce(draft).mockResolvedValue({ ...draft, datasetVersionId: saved.versionId });
  render(<CsvImportPanel api={api} visible onClose={vi.fn()} onSaved={onSaved} />);
  await screen.findByLabelText("Dataset name");
  await user.click(screen.getByRole("button", { name: "Confirm import and save Dataset" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  expect(api.updateCsvImport).not.toHaveBeenCalled();
  expect(api.uploadCsv).not.toHaveBeenCalled();
});

it("reviews saved file rows with retry and file provenance, without query actions", async () => {
  const user = userEvent.setup(); const api = makeApi();
  vi.mocked(api.getImportedRows!).mockRejectedValueOnce(new Error("Storage unavailable"));
  render(<ImportedDatasetReview api={api} dataset={saved} />);
  await user.click(await screen.findByRole("button", { name: "Retry loading rows" }));
  const table = await screen.findByRole("table", { name: "Imported Dataset rows" });
  expect(within(table).getByRole("cell", { name: "001" })).toBeVisible();
  expect(screen.queryByText(/SQL|Execution evidence|Query result/i)).not.toBeInTheDocument();
  await user.click(screen.getByText("File details"));
  expect(screen.getByText(draft.sha256)).toBeVisible();
});

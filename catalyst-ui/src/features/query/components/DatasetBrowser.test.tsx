import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkbenchEditorCatalog } from "../types";
import { DatasetBrowser } from "./DatasetBrowser";

const catalog: WorkbenchEditorCatalog = {
  contractVersion: "catalyst.workbench.editor-catalog.v1",
  catalogVersion: "analytics-catalog-v1",
  schemaVersion: "analytics-v1",
  dialect: "spark",
  schemas: [
    {
      name: "fhir",
      views: [
        {
          name: "patient_flat_v1",
          qualifiedName: "fhir.patient_flat_v1",
          grain: "Exactly one row per FHIR Patient.",
          columns: [
            {
              name: "patient_id",
              logicalType: "string",
              nullable: false,
              description: "FHIR Patient resource identifier.",
            },
          ],
        },
      ],
    },
    {
      name: "analytics",
      views: [
        {
          name: "lab_result_fact_v1",
          qualifiedName: "analytics.lab_result_fact_v1",
          grain: "Exactly one row per FHIR Observation.",
          columns: [
            {
              name: "patient_id",
              logicalType: "string",
              nullable: false,
              description: "FHIR Patient resource identifier.",
            },
            {
              name: "result_value",
              logicalType: "decimal",
              databaseType: "numeric(10,2)",
              nullable: true,
              unitColumn: "result_unit",
              description: "Numeric FHIR Quantity value.",
            },
          ],
        },
      ],
    },
  ],
};


describe("DatasetBrowser", () => {
  it("shows exact names, types and supplied descriptions for every relation", async () => {
    const user = userEvent.setup();
    render(<DatasetBrowser catalog={catalog} />);
    for (const name of ["analytics.lab_result_fact_v1", "fhir.patient_flat_v1"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(name) }));
    }
    expect(screen.getAllByText("patient_id")).toHaveLength(2);
    expect(screen.getByText("result_value")).toBeVisible();
    expect(screen.getByText("decimal")).toBeVisible();
    await user.click(screen.getByText("Database type", { exact: true }));
    expect(screen.getByText("numeric(10,2)")).toBeVisible();
    expect(screen.getByText("Numeric FHIR Quantity value.")).toBeVisible();
    expect(screen.getByText("result_unit")).toBeVisible();
    expect(screen.getByText(/^May be empty/)).toBeVisible();
    expect(screen.getByText("Exactly one row per FHIR Patient.")).toBeVisible();
  });

  it("searches names and descriptions across pages and clears back to the complete schema", async () => {
    const user = userEvent.setup();
    const largeCatalog: WorkbenchEditorCatalog = { ...catalog, schemas: [{ name: "source", views:
      Array.from({ length: 26 }, (_, i) => ({ name: `table_${i}`, qualifiedName: `source.table_${String(i).padStart(2, "0")}`,
        grain: "", columns: [{ name: `field_${i}`, logicalType: "string", nullable: true, description: i === 25 ? "Appointment location" : "" }] })) }] };
    render(<DatasetBrowser catalog={largeCatalog} />);
    expect(screen.queryByRole("button", { name: /source.table_25/ })).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search tables and fields" });
    await user.type(search, "appointment");
    expect(screen.getByText("1 of 26 tables and views match")).toBeVisible();
    expect(screen.getByText("field_25")).toBeVisible();
    await user.clear(search);
    await user.type(search, "field_24");
    expect(screen.getByText("field_24")).toBeVisible();
    await user.clear(search);
    expect(screen.getByText("26 tables and views")).toBeVisible();
    expect(screen.getByRole("button", { name: /source.table_00/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: /source.table_10/ })).toBeVisible();
  });

  it("distinguishes no matches, empty catalogs, missing schema and retryable errors", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { rerender } = render(<DatasetBrowser catalog={catalog} />);
    await user.type(screen.getByRole("searchbox"), "unknown field");
    expect(screen.getByText(/No matches/)).toBeVisible();
    rerender(<DatasetBrowser catalog={{ ...catalog, schemas: [] }} />);
    expect(screen.getByText(/No readable tables/)).toBeVisible();
    rerender(<DatasetBrowser catalog={null} catalogLoading />);
    expect(screen.getByText("Loading available data…")).toBeVisible();
    rerender(<DatasetBrowser catalog={null} catalogLoadingFailed onRetry={retry} />);
    expect(screen.getByRole("searchbox")).toHaveValue("unknown field");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<DatasetBrowser catalog={null} />);
    expect(screen.getByText(/Schema browsing is unavailable/)).toBeVisible();
  });

  it("keeps expanded fields and search when Advanced mode changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DatasetBrowser catalog={catalog} />);
    await user.type(screen.getByRole("searchbox"), "patient");
    await user.click(screen.getByRole("button", { name: /fhir.patient_flat_v1/ }));
    const details = screen.getByText("Schema details").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    rerender(<DatasetBrowser catalog={catalog} advancedMode />);
    expect(details).toHaveAttribute("open");
    expect(within(details).getByText("spark")).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveValue("patient");
    expect(screen.getByRole("button", { name: /fhir.patient_flat_v1/ })).toHaveAttribute("aria-expanded", "false");
  });
});

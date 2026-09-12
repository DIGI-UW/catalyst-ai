import { Disclosure } from "./Disclosure";
import { CheckmarkFilled, Close, DataBase, Renew } from "@carbon/icons-react";
import { Button, InlineNotification, Select, SelectItem, Tag, TextInput } from "@carbon/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalystApiError, type CatalystApi } from "../api";
import {
  editorContentMatchesVersion,
  editorExpectedColumns,
} from "../editorDigest";
import type {
  BoundParameter,
  DataSource,
  DashboardBuilderEntity,
  DashboardBuilderSection,
  DashboardPresentationKind,
  DashboardPublication,
  WorkbenchSession,
} from "../types";
import { savedQueryDraft } from "../savedQueryDraft";
import { DashboardArrangement, type ChartWidth } from "./DashboardArrangement";
import { ExecutionResult } from "./WorkbenchPanel";
import "./DashboardPublishPanel.css";

interface DashboardPublishPanelProps {
  advancedMode?: boolean;
  dataSources?: DataSource[];
  api: CatalystApi;
  session: WorkbenchSession | null;
  sql: string;
  parameters: BoundParameter[];
  activeSection: DashboardBuilderSection;
  disabled?: boolean;
  /** The thread supplies the result summaries and invokes this shared review. */
  hostedInThread?: boolean;
  registerDatasetOpener?: (open: ((executionId?: string) => void) | null) => void;
  onNavigate: (section: DashboardBuilderSection) => void;
  onReuseQuery?: (dataset: DashboardBuilderEntity) => void;
}

const dashboardWidths = (entity: DashboardBuilderEntity | null): Record<string, ChartWidth> => {
  const placements = entity?.configuration.widgets;
  if (!Array.isArray(placements)) return {};
  return Object.fromEntries(placements.filter(isRecord).map(item => [
    String(item.versionId), item.width === 4 || item.width === 6 ? item.width : 12,
  ]));
};

type ReviewPanel = "dataset" | "widget" | "dashboard" | null;

const presentations: Array<{ value: DashboardPresentationKind; label: string }> = [
  { value: "table", label: "Table" },
  { value: "big_number", label: "Big number" },
  { value: "time_series_line", label: "Time-series line" },
  { value: "time_series_area", label: "Time-series area" },
  { value: "grouped_bar", label: "Grouped bar" },
  { value: "stacked_bar", label: "Stacked bar" },
  { value: "proportion_bar", label: "100% stacked bar" },
];

const configurationValue = (entity: DashboardBuilderEntity, key: string) =>
  entity.configuration[key];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordValue = (source: Record<string, unknown> | undefined, key: string) => {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
};

const textValue = (source: Record<string, unknown> | undefined, key: string) => {
  const value = source?.[key];
  return typeof value === "string" && value ? value : undefined;
};

const configurationRecord = (entity: DashboardBuilderEntity, key: string) => {
  const value = configurationValue(entity, key);
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
};

const entityTitle = (entity: DashboardBuilderEntity, fallback: string) => {
  const title = configurationValue(entity, "title");
  return typeof title === "string" && title.trim() ? title : fallback;
};

const entityPresentation = (entity: DashboardBuilderEntity) => {
  const kind = configurationValue(entity, "presentationKind");
  return presentations.find((presentation) => presentation.value === kind)?.label ?? "Widget";
};

const dashboardWidgetVersionIds = (entity: DashboardBuilderEntity) => {
  const widgets = configurationValue(entity, "widgets");
  if (!Array.isArray(widgets)) return [];
  return widgets.flatMap((widget) => {
    if (typeof widget !== "object" || widget === null) return [];
    const versionId = (widget as Record<string, unknown>).versionId;
    return typeof versionId === "string" ? [versionId] : [];
  });
};

const newestSuccessfulExecution = (session: WorkbenchSession | null) =>
  session?.executions
    .filter((execution) => execution.status === "succeeded")
    .sort((left, right) => right.ordinal - left.ordinal)[0] ?? null;

const displayParameterValue = (value: BoundParameter["value"]) =>
  Array.isArray(value) ? JSON.stringify(value) : String(value);

const presentationPreview = (kind: DashboardPresentationKind) => {
  if (kind === "table") return "Table preview using every returned column";
  if (kind === "big_number") return "Single-value KPI preview";
  if (kind.startsWith("time_series")) return "Time-series preview using the temporal and numeric columns";
  return "Bar chart preview using the categorical and numeric columns";
};

interface PresentationAssessment {
  kind: DashboardPresentationKind;
  compatible: boolean;
  reason: string;
}

const datasetColumns = (dataset: DashboardBuilderEntity | null) => {
  const columns = dataset ? configurationValue(dataset, "columns") : null;
  return Array.isArray(columns) ? columns.filter(isRecord) : [];
};

const presentationAssessments = (
  dataset: DashboardBuilderEntity | null,
): PresentationAssessment[] => {
  const columns = datasetColumns(dataset);
  const rowCount = Number(
    (dataset ? configurationRecord(dataset, "rowCount") : null)?.returned ?? 0,
  );
  const numeric = columns.filter((column) =>
    ["integer", "decimal"].includes(String(column.logicalType)),
  );
  const temporal = columns.filter((column) =>
    ["date", "date-time"].includes(String(column.logicalType)),
  );
  const categorical = columns.filter((column) =>
    ["string", "boolean"].includes(String(column.logicalType)),
  );
  const compatible = (kind: DashboardPresentationKind) => {
    if (kind === "table") return true;
    if (kind === "big_number") return rowCount === 1 && columns.length === 1 && numeric.length === 1;
    if (kind === "time_series_line" || kind === "time_series_area") {
      return temporal.length > 0 && numeric.length > 0;
    }
    if (kind === "proportion_bar") return categorical.length > 1 && numeric.length > 0;
    return categorical.length > 0 && numeric.length > 0;
  };
  const reason = (kind: DashboardPresentationKind) => {
    if (kind === "table") return "Table supports every returned schema.";
    if (kind === "big_number") return "Big number requires exactly one returned numeric cell.";
    if (kind === "time_series_line" || kind === "time_series_area") {
      return `${presentations.find((item) => item.value === kind)?.label} requires a temporal and numeric column.`;
    }
    if (kind === "proportion_bar") {
      return "100% stacked bar requires two categorical columns and a numeric column.";
    }
    return `${presentations.find((item) => item.value === kind)?.label} requires a categorical and numeric column.`;
  };
  return presentations.map(({ value }) => ({
    kind: value,
    compatible: compatible(value),
    reason: reason(value),
  }));
};

const suggestedPresentation = (dataset: DashboardBuilderEntity | null) => {
  const assessments = presentationAssessments(dataset);
  const columns = datasetColumns(dataset);
  const rowCount = Number(
    (dataset ? configurationRecord(dataset, "rowCount") : null)?.returned ?? 0,
  );
  const numeric = columns.filter((column) =>
    ["integer", "decimal"].includes(String(column.logicalType)),
  );
  const temporal = columns.some((column) =>
    ["date", "date-time"].includes(String(column.logicalType)),
  );
  const categorical = columns.some((column) => String(column.logicalType) === "string");
  if (columns.length === 1 && numeric.length === 1 && rowCount === 1) return "big_number";
  if (temporal && numeric.length > 0) return "time_series_line";
  if (categorical && numeric.length > 0 && columns.length <= 4) return "grouped_bar";
  return assessments.find((assessment) => assessment.compatible)?.kind ?? "table";
};

const presentationBindingSummary = (
  dataset: DashboardBuilderEntity | null,
  kind: DashboardPresentationKind,
) => {
  const columns = datasetColumns(dataset);
  const names = (items: Record<string, unknown>[]) =>
    items.map((column) => String(column.name ?? "unnamed")).join(", ");
  const numeric = columns.filter((column) =>
    ["integer", "decimal"].includes(String(column.logicalType)),
  );
  const temporal = columns.filter((column) =>
    ["date", "date-time"].includes(String(column.logicalType)),
  );
  const categorical = columns.filter((column) =>
    ["string", "boolean"].includes(String(column.logicalType)),
  );
  if (kind === "table") return `Columns: ${names(columns) || "none"}`;
  if (kind === "big_number") return `Metric: ${names(numeric.slice(0, 1))}`;
  if (kind === "time_series_line" || kind === "time_series_area") {
    return `Time: ${names(temporal.slice(0, 1))} · Metric: ${names(numeric.slice(0, 1))}`;
  }
  return `Category: ${names(categorical.slice(0, 1))} · Metric: ${names(numeric.slice(0, 1))}`;
};

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
};

const hasExactImportedEvidence = (publication: DashboardPublication | undefined) =>
  publication?.status === "imported" &&
  publication.importState?.outcome === "imported" &&
  Boolean(publication.importState.receiptId) &&
  Boolean(publication.importState.receiptDigest) &&
  Boolean(publication.importState.dashboardUrl);

const publicationFailureGuidance = (
  publication: DashboardPublication,
  importEvidenceIncomplete: boolean,
) => {
  if (importEvidenceIncomplete) {
    return "The import receipt does not exactly match this Dashboard version. Run the local Superset status/import helper for this exact bundle, then reload.";
  }
  if (
    publication.importState?.recoveryAction ===
    "full_reset_then_reimport_last_verified_bundle"
  ) {
    return "Stop the local Superset stack, fully reset only its metadata database and home volumes, then reimport and verify this Dashboard's last-verified bundle. Do not delete individual assets.";
  }
  return "Run the local Superset import helper again for this exact bundle, then reload this page.";
};

export const DashboardPublishPanel = ({
  advancedMode = false,
  dataSources = [],
  api,
  session,
  sql,
  parameters,
  activeSection,
  hostedInThread = false,
  registerDatasetOpener,
  disabled = false,
  onNavigate,
  onReuseQuery,
}: DashboardPublishPanelProps) => {
  const [datasets, setDatasets] = useState<DashboardBuilderEntity[]>([]);
  const [widgets, setWidgets] = useState<DashboardBuilderEntity[]>([]);
  const [dashboards, setDashboards] = useState<DashboardBuilderEntity[]>([]);
  const [panel, setPanel] = useState<ReviewPanel>(null);
  const [datasetTitle, setDatasetTitle] = useState("");
  const [hydratedDatasetSession, setHydratedDatasetSession] = useState<{
    datasetVersionId: string;
    session: WorkbenchSession;
  } | null>(null);
  const [datasetEvidenceLoading, setDatasetEvidenceLoading] = useState(false);
  const [widgetTitle, setWidgetTitle] = useState("");
  const [dashboardTitle, setDashboardTitle] = useState("");
  const [reviewedWidgetVersionId, setReviewedWidgetVersionId] = useState("");
  const [reviewedDashboardVersionId, setReviewedDashboardVersionId] = useState("");
  const [placementDashboardVersionId, setPlacementDashboardVersionId] = useState("");
  const [widgetWidths, setWidgetWidths] = useState<Record<string, ChartWidth>>({});
  const [presentationKind, setPresentationKind] =
    useState<DashboardPresentationKind>("table");
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] = useState("");
  const [reviewedDatasetVersionId, setReviewedDatasetVersionId] = useState("");
  const [reviewedExecutionId, setReviewedExecutionId] = useState("");
  const [selectedWidgetVersionIds, setSelectedWidgetVersionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(
    Boolean(api.listDashboardDatasets && api.listDashboardWidgets && api.listDashboards),
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [publication, setPublication] = useState<DashboardPublication | null>(null);
  const [publicationsByVersion, setPublicationsByVersion] = useState<
    Record<string, DashboardPublication>
  >({});
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const [returnFocusTarget, setReturnFocusTarget] = useState<HTMLElement | null>(null);

  const execution = newestSuccessfulExecution(session);
  const executionVersion = execution
    ? session?.versions.find((version) => version.versionId === execution.versionId) ?? null
    : null;
  const executionVersionOrdinal = executionVersion?.ordinal ?? "?";
  const editorMatchesCurrent = Boolean(
    session?.currentVersion &&
      editorContentMatchesVersion(
        {
          sql,
          parameters,
          // Compared the way the editor compares. This read `sql ===
          // currentVersion.sql`, so once the editor presented the model's
          // query laid out, the columns were dropped, the content stopped
          // matching, and every model result was reported stale -- which
          // disabled "Save query" for queries nobody had touched.
          expectedColumns: editorExpectedColumns(session.currentVersion, sql),
        },
        session.currentVersion,
      ),
  );
  const resultIsStale = Boolean(
    execution &&
      (!editorMatchesCurrent ||
        execution.versionId !== session?.currentVersion?.versionId),
  );
  const supported = Boolean(
    api.saveDashboardDataset &&
      api.saveDashboardWidget &&
      api.saveDashboard &&
      api.publishDashboard,
  );

  const currentDataset = useMemo(
    () =>
      execution && session
        ? datasets.find((candidate) => {
            const source = configurationRecord(candidate, "source");
            return (
              source?.sessionId === session.sessionId &&
              source?.executionId === execution.executionId
            );
          }) ?? null
        : null,
    [datasets, execution, session],
  );

  const reviewedDataset = reviewedDatasetVersionId
    ? datasets.find((candidate) => candidate.versionId === reviewedDatasetVersionId) ?? null
    : reviewedExecutionId
      ? null
      : currentDataset;
  const reviewedDatasetSource = reviewedDataset
    ? configurationRecord(reviewedDataset, "source")
    : null;
  const reviewedSession = reviewedDatasetSource
    ? reviewedDatasetSource.sessionId === session?.sessionId
      ? session
      : hydratedDatasetSession &&
          hydratedDatasetSession.datasetVersionId === reviewedDataset?.versionId
        ? hydratedDatasetSession.session
        : null
    : session;
  const reviewedSourceId = String(
    reviewedDatasetSource?.dataSourceId ?? reviewedSession?.dataSourceId ?? "Unknown source",
  );
  const reviewedExecution = reviewedDatasetSource
    ? reviewedSession?.executions.find(
        (candidate) => candidate.executionId === reviewedDatasetSource.executionId,
      ) ?? null
    : reviewedExecutionId
      ? session?.executions.find((candidate) => candidate.executionId === reviewedExecutionId) ?? null
      : execution;
  const canSaveReviewedResult = Boolean(
    !reviewedDataset && reviewedExecution &&
    reviewedExecution.executionId === execution?.executionId &&
    !resultIsStale,
  );
  const reviewedVersion = reviewedExecution && reviewedSession
    ? reviewedSession.versions.find((version) => version.versionId === reviewedExecution.versionId) ?? null
    : null;
  const reviewedValidation = reviewedExecution && reviewedSession
    ? (reviewedSession.validations ?? [])
        .filter(
          (validation) =>
            validation.versionId === reviewedExecution.versionId &&
            validation.queryDigest === reviewedExecution.queryDigest,
        )
        .sort((left, right) => right.ordinal - left.ordinal)[0] ?? null
    : null;
  const reviewedProvenance = reviewedVersion?.provenance;
  const sessionProvenance = reviewedSession?.provenance;
  const profileSnapshot =
    recordValue(reviewedProvenance, "profileSnapshot") ??
    (recordValue(reviewedProvenance, "roleModels") ? reviewedProvenance : undefined) ??
    recordValue(sessionProvenance, "profileSnapshot");
  const roleModels = recordValue(profileSnapshot, "roleModels");
  const profileLabel =
    textValue(profileSnapshot, "profileLabel") ??
    textValue(profileSnapshot, "profileName") ??
    textValue(reviewedProvenance, "profileLabel") ??
    reviewedSession?.profileId ??
    "Unknown profile";
  const catalystTraceId =
    textValue(reviewedProvenance, "catalystTraceId") ??
    textValue(sessionProvenance, "catalystTraceId");
  const hubTraceId =
    textValue(reviewedProvenance, "hubTraceId") ??
    textValue(sessionProvenance, "hubTraceId");

  useEffect(() => {
    if (!api.listDashboardDatasets || !api.listDashboardWidgets || !api.listDashboards) {
      return;
    }
    const controller = new AbortController();
    Promise.all([
      api.listDashboardDatasets(controller.signal),
      api.listDashboardWidgets(controller.signal),
      api.listDashboards(controller.signal),
    ])
      .then(([datasetCollection, widgetCollection, dashboardCollection]) => {
        if (controller.signal.aborted) return;
        setDatasets(datasetCollection.items);
        setWidgets(widgetCollection.items);
        setDashboards(dashboardCollection.items);
        if (api.getDashboardPublication) {
          void Promise.all(
            dashboardCollection.items.map(async (dashboard) => {
              try {
                return [
                  dashboard.versionId,
                  await api.getDashboardPublication!(dashboard.versionId, controller.signal),
                ] as const;
              } catch (caught) {
                if (caught instanceof CatalystApiError && caught.status === 404) {
                  return null;
                }
                throw caught;
              }
            }),
          )
            .then((entries) => {
              if (controller.signal.aborted) return;
              setPublicationsByVersion(
                Object.fromEntries(entries.filter((entry) => entry !== null)),
              );
            })
            .catch((caught: unknown) => {
              if (!controller.signal.aborted) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Catalyst could not load Superset publication state.",
                );
              }
            });
        }
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Catalyst could not load the dashboard libraries.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api]);

  const effectiveDatasetVersionId =
    selectedDatasetVersionId || currentDataset?.versionId || datasets[0]?.versionId || "";
  const selectedDataset =
    datasets.find((candidate) => candidate.versionId === effectiveDatasetVersionId) ?? null;
  const selectedPresentationAssessments = presentationAssessments(selectedDataset);
  const compatiblePresentations = selectedPresentationAssessments.filter(
    (assessment) => assessment.compatible,
  );
  const suggestedKind = suggestedPresentation(selectedDataset);
  const reviewedWidget = widgets.find(item => item.versionId === reviewedWidgetVersionId);
  const widgetUnchanged = Boolean(reviewedWidget && widgetTitle.trim() === entityTitle(reviewedWidget, "Chart")
    && effectiveDatasetVersionId === reviewedWidget.configuration.datasetVersionId
    && presentationKind === reviewedWidget.configuration.presentationKind);
  const placementDashboards = dashboards.filter(candidate =>
    !dashboards.some(other => other.id === candidate.id && other.ordinal > candidate.ordinal)
    && dashboardWidgetVersionIds(candidate).every(id => {
      const widget = widgets.find(item => item.versionId === id);
      const dataset = datasets.find(item => item.versionId === widget?.configuration.datasetVersionId);
      const source = dataset && configurationRecord(dataset, "source")?.dataSourceId;
      return Boolean(source && selectedDataset && source === configurationRecord(selectedDataset, "source")?.dataSourceId);
    }));
  const reviewedDashboard = dashboards.find(item => item.versionId === reviewedDashboardVersionId);
  const dashboardUnchanged = Boolean(reviewedDashboard && dashboardTitle.trim() === entityTitle(reviewedDashboard, "Dashboard")
    && JSON.stringify(selectedWidgetVersionIds) === JSON.stringify(dashboardWidgetVersionIds(reviewedDashboard))
    && selectedWidgetVersionIds.every(id => (widgetWidths[id] ?? 12) === dashboardWidths(reviewedDashboard)[id]));


  useEffect(() => {
    if (!panel) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        window.setTimeout(() => returnFocusTarget?.focus(), 0);
        return;
      }
      if (event.key !== "Tab" || !reviewRef.current) return;
      const focusable = Array.from(
        reviewRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.closest("[hidden]") &&
        !Array.from(reviewRef.current!.querySelectorAll("details:not([open])"))
          .some((details) => details.contains(element) && details.querySelector("summary") !== element));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel, returnFocusTarget]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openPanel = (
    next: Exclude<ReviewPanel, null>,
    entityVersionId?: string,
    executionId?: string,
  ) => {
    if (!panel) setReturnFocusTarget(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError(null);
    setPublication(null);
    if (next === "dataset") {
      const selected = entityVersionId
        ? datasets.find((candidate) => candidate.versionId === entityVersionId) ?? null
        : executionId
          ? datasets.find((candidate) => {
              const source = configurationRecord(candidate, "source");
              return source?.sessionId === session?.sessionId && source?.executionId === executionId;
            }) ?? null
          : currentDataset;
      setReviewedExecutionId(executionId ?? execution?.executionId ?? "");
      setReviewedDatasetVersionId(selected?.versionId ?? "");
      setDatasetTitle(selected ? entityTitle(selected, "Dataset") : "");
      setHydratedDatasetSession(null);
      setDatasetEvidenceLoading(false);
      const source = selected ? configurationRecord(selected, "source") : null;
      const sourceSessionId =
        typeof source?.sessionId === "string" ? source.sessionId : null;
      if (
        selected &&
        sourceSessionId &&
        sourceSessionId !== session?.sessionId &&
        api.getWorkbenchSession
      ) {
        setDatasetEvidenceLoading(true);
        void api.getWorkbenchSession(sourceSessionId)
          .then((sourceSession) => {
            setHydratedDatasetSession({
              datasetVersionId: selected.versionId,
              session: sourceSession,
            });
          })
          .catch((caught: unknown) => {
            setError(
              caught instanceof Error
                ? caught.message
                : "Catalyst could not load the Dataset's source execution.",
            );
          })
          .finally(() => setDatasetEvidenceLoading(false));
      }
    }
    if (next === "widget") {
      const saved = widgets.find(item => item.versionId === entityVersionId);
      const datasetVersionId = saved ? String(saved.configuration.datasetVersionId)
        : entityVersionId ?? currentDataset?.versionId ?? datasets[0]?.versionId ?? "";
      const dataset = datasets.find(candidate => candidate.versionId === datasetVersionId) ?? null;
      setReviewedWidgetVersionId(saved?.versionId ?? "");
      setPlacementDashboardVersionId("");
      setWidgetTitle(saved ? entityTitle(saved, "Chart") : "");
      setSelectedDatasetVersionId(datasetVersionId);
      setPresentationKind(saved ? saved.configuration.presentationKind as DashboardPresentationKind : suggestedPresentation(dataset));
    }
    if (next === "dashboard") {
      const saved = dashboards.find(item => item.versionId === entityVersionId);
      setReviewedDashboardVersionId(saved?.versionId ?? "");
      setDashboardTitle(saved ? entityTitle(saved, "Dashboard") : "");
      setWidgetWidths(dashboardWidths(saved ?? null));
      setSelectedWidgetVersionIds(saved ? dashboardWidgetVersionIds(saved)
        : entityVersionId ? [entityVersionId] : widgets[0] ? [widgets[0].versionId] : []);
    }
    setPanel(next);
  };

  const closePanel = () => {
    setPanel(null);
    window.setTimeout(() => returnFocusTarget?.focus(), 0);
  };

  const saveDataset = async () => {
    if (!session || !reviewedExecution || !api.saveDashboardDataset || !canSaveReviewedResult || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveDashboardDataset({
        sessionId: session.sessionId,
        executionId: reviewedExecution.executionId,
        ...(datasetTitle.trim() ? { title: datasetTitle.trim() } : {}),
      });
      setDatasets((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
      setSelectedDatasetVersionId(saved.versionId);
      setToast(`“${entityTitle(saved, "Dataset")}” saved to Saved queries.`);
      // Stay open. Saving used to close onto the thread, and the next step —
      // a Widget — lived in a nav section you had to already know about, so
      // the chain ended at the moment it should have continued. Re-pointing
      // the panel at the saved entity turns its footer into that next step.
      setReviewedDatasetVersionId(saved.versionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Catalyst could not save this Dataset.");
    } finally {
      setBusy(false);
    }
  };

  const saveWidget = async () => {
    if (!effectiveDatasetVersionId || !api.saveDashboardWidget || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = widgetUnchanged && reviewedWidget ? reviewedWidget : await api.saveDashboardWidget({
        datasetVersionId: effectiveDatasetVersionId,
        ...(widgetTitle.trim() ? { title: widgetTitle.trim() } : {}),
        presentationKind,
        ...(reviewedWidgetVersionId ? { baseVersionId: reviewedWidgetVersionId } : {}),
      });
      setWidgets((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
      setSelectedWidgetVersionIds((current) =>
        current.includes(saved.versionId) ? current : [...current, saved.versionId],
      );
      setReviewedWidgetVersionId(saved.versionId);
      setWidgetTitle(entityTitle(saved, "Chart"));
      if (placementDashboardVersionId && api.saveDashboard) {
        const destination = placementDashboards.find(item => item.versionId === placementDashboardVersionId);
        if (!destination) throw new Error("The chart is saved. Choose a Dashboard using the same data source.");
        const previousIds = dashboardWidgetVersionIds(destination);
        const ids = previousIds.includes(saved.versionId) ? previousIds : [...previousIds, saved.versionId];
        const arranged = await api.saveDashboard({
          baseVersionId: destination.versionId, title: entityTitle(destination, "Dashboard"),
          widgetVersionIds: ids,
          widgetWidths: { ...dashboardWidths(destination), [saved.versionId]: 12 },
        });
        setDashboards(current => [arranged, ...current.filter(item => item.versionId !== arranged.versionId)]);
        setToast(`“${entityTitle(saved, "Chart")}” saved and added to ${entityTitle(arranged, "Dashboard")}.`);
      } else {
        setToast(`“${entityTitle(saved, "Chart")}” saved to Charts and tables.`);
      }
      closePanel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Catalyst could not save this Widget.");
    } finally {
      setBusy(false);
    }
  };

  const saveDashboard = async () => {
    if (!api.saveDashboard || selectedWidgetVersionIds.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveDashboard({
        widgetVersionIds: selectedWidgetVersionIds,
        widgetWidths: Object.fromEntries(selectedWidgetVersionIds.map(id => [id, widgetWidths[id] ?? 12])),
        ...(reviewedDashboardVersionId ? { baseVersionId: reviewedDashboardVersionId } : {}),
        ...(dashboardTitle.trim() ? { title: dashboardTitle.trim() } : {}),
      });
      setDashboards((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
      setToast(`“${entityTitle(saved, "Dashboard")}” saved to Dashboards.`);
      closePanel();
      onNavigate("dashboards");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Catalyst could not save this Dashboard.");
    } finally {
      setBusy(false);
    }
  };

  const publishDashboard = async (dashboard: DashboardBuilderEntity) => {
    if (!api.publishDashboard || busy) return;
    setBusy(true);
    setError(null);
    setPublication(null);
    try {
      const result = await api.publishDashboard(dashboard.versionId);
      setPublication(result);
      setPublicationsByVersion((current) => ({
        ...current,
        [dashboard.versionId]: result,
      }));
      setToast(
        `“${entityTitle(dashboard, "Dashboard")}” is ready for the local Superset importer.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Catalyst could not publish this Dashboard.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    registerDatasetOpener?.((executionId) => openPanel("dataset", undefined, executionId));
    return () => registerDatasetOpener?.(null);
  });

  const renderAskArtifacts = () => {
    if (!session) return null;
    // The thread owns each turn's dataset, and a session with nothing asked of
    // it has no result to promote.
    if (hostedInThread) return null;
    if (!supported) {
      return (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Dashboard promotion is unavailable in this deployment."
        />
      );
    }
    if (!execution) {
      return (
        <p className="builder-empty-note">
          Run the current query to create a reviewable Dataset draft.
        </p>
      );
    }
    const datasetTitle = currentDataset
      ? entityTitle(currentDataset, "Saved Dataset")
      : `Dataset from Query v${executionVersionOrdinal}`;
    const datasetState = resultIsStale
      ? "Stale"
      : currentDataset
        ? "Saved"
        : "Draft";

    return (
      <section className="builder-artifacts" aria-label="Dashboard artifacts">
        <button type="button" className="builder-artifact-tile" disabled={disabled}
          onClick={() => openPanel("dataset", currentDataset?.versionId)}
          aria-label="Review results">
          <DataBase size={20} aria-hidden="true" />
          <span><strong>{datasetTitle}</strong><small>{execution.result?.rowCount.returned ?? 0} rows · {resultIsStale ? "Your query has changed" : "Review the result and save your query"}</small></span>
          <Tag type={resultIsStale ? "warm-gray" : currentDataset ? "green" : "cool-gray"}>{datasetState}</Tag>
        </button>
        {currentDataset && (
          <button
            type="button"
            className="builder-artifact-tile"
            disabled={disabled}
            onClick={(event) => {
              setReturnFocusTarget(event.currentTarget);
              openPanel("widget");
            }}
            aria-label="Review widget draft"
          >
            <span className="builder-artifact-tile__chart" aria-hidden="true">↗</span>
            <span>
              <strong>Create a Widget</strong>
              <small>Choose a compatible Superset visualization for this Dataset</small>
            </span>
            <Tag type="purple">Draft</Tag>
          </button>
        )}
      </section>
    );
  };

  const renderLibraryNavigation = () => (
    <nav className="builder-library__navigation" aria-label="Saved work">
      {([
        ["datasets", "Saved queries", datasets.length],
        ["widgets", "Charts and tables", widgets.length],
        ["dashboards", "Dashboards", dashboards.length],
      ] as const).map(([id, label, count]) => (
        <Button key={id} kind="ghost" aria-label={label}
          aria-current={activeSection === id ? "page" : undefined}
          onClick={() => onNavigate(id)}>{label} ({count})</Button>
      ))}
    </nav>
  );

  const renderDatasets = () => (
    <section className="builder-library" aria-labelledby="datasets-title">
      <header className="builder-library__header">
        <div>
          <p className="eyebrow">Saved work</p>
          <h1 id="datasets-title">Saved queries</h1>
          <p>Saved queries you can reuse in charts and dashboards.</p>
        </div>
      </header>
      {renderLibraryNavigation()}
      {datasets.length === 0 ? (
        <p className="builder-empty-note">No saved queries yet. Start with a question in Explore, get results, then save your query.</p>
      ) : (
        <div className="builder-saved-list">
          {datasets.map((dataset) => {
            const source = configurationRecord(dataset, "source");
            const sourceId = String(source?.dataSourceId ?? "Unknown");
            const columns = configurationValue(dataset, "columns");
            const rowCount = configurationRecord(dataset, "rowCount");
            const savedParameters = configurationValue(dataset, "parameters");
            const parameters = Array.isArray(savedParameters) ? savedParameters.filter(isRecord) : [];
            const widgetCount = widgets.filter(
              (widget) => configurationValue(widget, "datasetVersionId") === dataset.versionId,
            ).length;
            const title = entityTitle(dataset, "Saved query");
            return (
              <article key={dataset.versionId} className="builder-saved-card" aria-label={title}>
                <header className="builder-saved-card__header">
                  <h2>{title}</h2>
                  <Tag type="gray">Saved</Tag>
                </header>
                <dl className="builder-saved-card__facts">
                  <div><dt>Source</dt><dd>{dataSources.find((item) => item.id === sourceId)?.label ?? sourceId}</dd></div>
                  <div><dt>Saved version</dt><dd>{dataset.ordinal}</dd></div>
                  <div><dt>Used by</dt><dd>{widgetCount} {widgetCount === 1 ? "chart" : "charts"}</dd></div>
                </dl>
                {parameters.length > 0 && <p className="builder-saved-card__parameters">
                  {parameters.map((parameter) => `${parameter.name} · ${parameter.type}`).join("; ")}
                </p>}
                <Disclosure className="builder-saved-card__details" open={advancedMode || undefined} title="Query details">
                  <p>{Array.isArray(columns) ? columns.length : "Unknown"} columns · {String(rowCount?.returned ?? "Unknown")} rows · {parameters.length} parameters · Saved {dateLabel(dataset.createdAt)}</p>
                </Disclosure>
                <div className="builder-saved-card__actions">
                  <Button type="button" aria-label={`Review ${title}`}
                    onClick={(event) => {
                      setReturnFocusTarget(event.currentTarget);
                      openPanel("dataset", dataset.versionId);
                    }}>Review saved query</Button>
                  <Button type="button" kind="tertiary" disabled={disabled || busy}
                    onClick={(event) => {
                      setReturnFocusTarget(event.currentTarget);
                      openPanel("widget", dataset.versionId);
                    }}>Create chart or table</Button>
                  {onReuseQuery && <Button type="button" kind="ghost"
                    disabled={disabled || busy || !savedQueryDraft(dataset)}
                    onClick={() => onReuseQuery(dataset)}>Start from this SQL</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderWidgets = () => (
    <section className="builder-library" aria-labelledby="widgets-title">
      <header className="builder-library__header">
        <div>
          <p className="eyebrow">Saved work</p>
          <h1 id="widgets-title">Charts and tables</h1>
          <p>Charts and tables built from your saved queries.</p>
        </div>
        <Button
          type="button"
          disabled={datasets.length === 0}
          onClick={(event) => {
            setReturnFocusTarget(event.currentTarget);
            openPanel("widget");
          }}
        >
          New chart or table
        </Button>
      </header>
      {renderLibraryNavigation()}
      {widgets.length === 0 ? (
        <p className="builder-empty-note">No charts or tables saved yet. Choose a saved query to create one.</p>
      ) : (
        <div className="builder-saved-list">
          {widgets.map(widget => {
            const dataset = datasets.find(item => item.versionId === widget.configuration.datasetVersionId);
            const sourceId = dataset ? String(configurationRecord(dataset, "source")?.dataSourceId ?? "Unknown") : "Unknown";
            const placements = dashboards.filter(item => dashboardWidgetVersionIds(item).includes(widget.versionId));
            return <article key={widget.versionId} className="builder-saved-card" aria-label={`${entityTitle(widget, "Chart")} version ${widget.ordinal}`}>
              <header className="builder-saved-card__header">
                <h2>{entityTitle(widget, "Chart")}</h2><Tag type="gray">Saved</Tag>
              </header>
              <p className="builder-saved-card__parameters"><span>{entityPresentation(widget)}</span> · {dataset ? entityTitle(dataset, "Saved query") : "Saved query unavailable"}</p>
              <dl className="builder-saved-card__facts">
                <div><dt>Source</dt><dd>{dataSources.find(item => item.id === sourceId)?.label ?? sourceId}</dd></div>
                <div><dt>Saved version</dt><dd>{widget.ordinal}</dd></div>
                <div><dt>Used by</dt><dd>{placements.length} {placements.length === 1 ? "Dashboard" : "Dashboards"}</dd></div>
              </dl>
              <div className="builder-saved-card__actions">
                <Button onClick={event => {
                  setReturnFocusTarget(event.currentTarget);
                  openPanel("widget", widget.versionId);
                }}>Review {entityTitle(widget, "chart")}</Button>
                <Button kind="tertiary" onClick={event => {
                  setReturnFocusTarget(event.currentTarget);
                  openPanel("dashboard", widget.versionId);
                }}>Add {entityTitle(widget, "Chart")} to dashboard</Button>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  );

  const renderDashboards = () => (
    <section className="builder-library" aria-labelledby="dashboards-title">
      <header className="builder-library__header">
        <div>
          <p className="eyebrow">Saved work</p>
          <h1 id="dashboards-title">Dashboards</h1>
          <p>Bring your charts together and open them in Superset.</p>
        </div>
        <Button
          type="button"
          disabled={widgets.length === 0}
          onClick={(event) => {
            setReturnFocusTarget(event.currentTarget);
            openPanel("dashboard");
          }}
        >
          New Dashboard
        </Button>
      </header>
      {renderLibraryNavigation()}
      {dashboards.length === 0 ? (
        <p className="builder-empty-note">No Dashboards saved yet.</p>
      ) : (
        <div className="builder-dashboard-list">
          {dashboards.map((dashboard) => {
            const savedPublication = publicationsByVersion[dashboard.versionId];
            const exactImported = hasExactImportedEvidence(savedPublication);
            const importEvidenceIncomplete = Boolean(
              savedPublication?.status === "imported" && !exactImported,
            );
            const displayStatus = importEvidenceIncomplete
              ? "import_failed"
              : savedPublication?.status;
            return (
              <article key={dashboard.versionId} className="builder-saved-card builder-dashboard-row" aria-label={`${entityTitle(dashboard, "Dashboard")} version ${dashboard.ordinal}`}>
                <div>
                  <h2>{entityTitle(dashboard, "Dashboard")}</h2>
                  <p>Version {dashboard.ordinal} · {dashboardWidgetVersionIds(dashboard).length} charts · saved {dateLabel(dashboard.createdAt)}</p>
                  {displayStatus === "imported" && <Tag type="green">Imported</Tag>}
                  {displayStatus === "bundle_ready" && <Tag type="blue">Superset bundle ready</Tag>}
                  {displayStatus === "import_failed" && savedPublication && (
                    <>
                      <Tag type="red">Import failed</Tag>
                      <small className="builder-dashboard-row__diagnostic">
                        {savedPublication.importState?.errorCode ??
                          (importEvidenceIncomplete ? "import_evidence_incomplete" : "import_failed")}
                        {" — "}
                        {publicationFailureGuidance(
                          savedPublication,
                          importEvidenceIncomplete,
                        )}
                      </small>
                    </>
                  )}
                </div>
                <DashboardArrangement
                  widgets={dashboardWidgetVersionIds(dashboard).flatMap(id => widgets.find(item => item.versionId === id) ?? [])}
                  widths={dashboardWidths(dashboard)} />
                <div className="builder-saved-card__actions builder-dashboard-row__actions">
                  <Button kind="tertiary" onClick={event => {
                    setReturnFocusTarget(event.currentTarget);
                    openPanel("dashboard", dashboard.versionId);
                  }}>Review and arrange {entityTitle(dashboard, "Dashboard")}</Button>
                  {exactImported && savedPublication?.importState?.dashboardUrl ? (
                    <Button
                      as="a"
                      kind="primary"
                      href={savedPublication.importState.dashboardUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Superset
                    </Button>
                  ) : !savedPublication || displayStatus === "import_failed" ? (
                    <Button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => void publishDashboard(dashboard)}
                    >
                      Publish to Superset
                    </Button>
                  ) : null}
                  {savedPublication && (
                    <a href={savedPublication.downloadPath}>Download bundle</a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <>
      {activeSection === "ask" && renderAskArtifacts()}
      {activeSection === "datasets" && renderDatasets()}
      {activeSection === "widgets" && renderWidgets()}
      {activeSection === "dashboards" && renderDashboards()}

      {loading && activeSection !== "ask" && <p role="status">Loading library…</p>}
      {error && !panel && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not save or publish this work"
          subtitle={error}
        />
      )}

      {panel && (
        <>
          <button
            type="button"
            className="builder-review-backdrop"
            aria-label="Close review panel"
            tabIndex={-1}
            onClick={closePanel}
          />
          <aside
            ref={reviewRef}
            className="builder-review"
            role="dialog"
            aria-label="Review panel"
            aria-modal="true"
          >
            <header className="builder-review__header">
              <div>
                <p className="eyebrow">
                  {panel === "dataset" ? "Query result" : panel === "widget" ? "Chart or table" : "Dashboard"}
                </p>
                <h2>
                  {panel === "dataset"
                    ? reviewedDataset ? "Review saved query" : "Review results"
                    : panel === "widget"
                      ? reviewedWidgetVersionId ? "Review saved chart" : "Review chart draft"
                      : reviewedDashboardVersionId ? "Review and arrange Dashboard" : "Create Dashboard"}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="builder-review__close"
                aria-label="Close"
                onClick={closePanel}
              >
                <Close size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="builder-review__body">
              {error && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title="Could not complete the action"
                  subtitle={error}
                />
              )}
              {panel === "dataset" && reviewedSession && reviewedExecution && (
                <>
                  <TextInput
                    id="builder-dataset-title"
                    labelText="Query name"
                    value={datasetTitle}
                    disabled={busy}
                    readOnly={Boolean(reviewedDataset) || !canSaveReviewedResult}
                    placeholder="Give this query a name"
                    onChange={(event) => setDatasetTitle(event.currentTarget.value)}
                  />
                  {!reviewedDataset && !canSaveReviewedResult && (
                    <InlineNotification
                      kind="warning"
                      lowContrast
                      hideCloseButton
                      title="Earlier result"
                      subtitle="Your current query differs from this result. You can inspect it here; run the current query before saving new work."
                    />
                  )}
                  <p>Source: {dataSources.find((source) => source.id === reviewedSourceId)?.label ?? reviewedSourceId}</p>
                  {reviewedExecution.result && <p>{reviewedExecution.result.rowCount.returned} {reviewedExecution.result.rowCount.returned === 1 ? "row" : "rows"} · {reviewedExecution.result.columns.length} {reviewedExecution.result.columns.length === 1 ? "column" : "columns"}</p>}
                  {reviewedValidation && reviewedValidation.findings.length > 0 && (
                    <p role="status">This query has {reviewedValidation.findings.length} advisory {reviewedValidation.findings.length === 1 ? "finding" : "findings"}. Review them in Technical details before using the results.</p>
                  )}
                  <p>Database diagnostic: {reviewedExecution.databaseDiagnostic?.message ?? "None — query completed successfully."}</p>
                  <p>Limits: up to {reviewedExecution.maxRows.toLocaleString()} rows and {reviewedExecution.statementTimeoutMs / 1000} seconds per run.</p>
                  <ExecutionResult
                    session={reviewedSession}
                    sql={reviewedExecution.query.sql}
                    parameters={reviewedExecution.query.parameters}
                    executionOverride={reviewedExecution}
                    immutableSnapshot
                    compact
                    pageSize={25}
                  />
                  <Disclosure className="builder-review__technical" open={advancedMode} title="Technical details">
                    {!reviewedDataset && reviewedSession.executions.filter((run) => run.status === "succeeded").length > 1 && (
                      <Select id="review-recorded-result" labelText="Recorded result" value={reviewedExecution.executionId}
                        onChange={(event) => openPanel("dataset", undefined, event.currentTarget.value)}>
                        {reviewedSession.executions.filter((run) => run.status === "succeeded").map((run) => (
                          <SelectItem key={run.executionId} value={run.executionId}
                            text={`Run ${run.ordinal} · ${dateLabel(run.completedAt)}`} />
                        ))}
                      </Select>
                    )}
                    <dl className="builder-review__metrics">
                      <div><dt>Exact query</dt><dd>Query v{reviewedVersion?.ordinal ?? "?"}</dd></div>
                      <div><dt>Execution</dt><dd>Run {reviewedExecution.ordinal}</dd></div>
                      <div><dt>Source</dt><dd>{reviewedSession.dataSourceId ?? "Unknown source"}</dd></div>
                      <div><dt>Status</dt><dd>{reviewedExecution.status}</dd></div>
                      <div><dt>Catalog</dt><dd>{reviewedSession.catalogVersion ?? "Unknown"}</dd></div>
                      <div><dt>Profile</dt><dd>{profileLabel}</dd></div>
                      {roleModels && Object.entries(roleModels)
                        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([role, model]) => (
                          <div key={role}><dt>{role.replaceAll("_", " ")}</dt><dd>{model}</dd></div>
                        ))}
                      {catalystTraceId && <div><dt>Catalyst trace</dt><dd>{catalystTraceId}</dd></div>}
                      {hubTraceId && <div><dt>Hub trace</dt><dd>{hubTraceId}</dd></div>}
                      <div>
                        <dt>Database diagnostic</dt>
                        <dd>
                          {reviewedExecution.databaseDiagnostic?.message ??
                            (reviewedExecution.status === "succeeded"
                              ? "None — run succeeded"
                              : "Unavailable")}
                        </dd>
                      </div>
                    </dl>
                    <section className="builder-review__evidence" aria-labelledby="dataset-parameters-title">
                      <h3 id="dataset-parameters-title">Typed parameters</h3>
                      {reviewedExecution.query.parameters.length === 0 ? (
                        <p>No bound parameters.</p>
                      ) : (
                        <dl>
                          {reviewedExecution.query.parameters.map((parameter) => (
                            <div key={parameter.name}>
                              <dt>:{parameter.name}</dt>
                              <dd>{parameter.type}</dd>
                              <dd>{displayParameterValue(parameter.value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </section>
                    <section className="builder-review__evidence" aria-labelledby="dataset-findings-title">
                      <h3 id="dataset-findings-title">Validation findings</h3>
                      {!reviewedValidation || reviewedValidation.findings.length === 0 ? (
                        <p>No validation findings recorded for this exact query.</p>
                      ) : (
                        <ul>
                          {reviewedValidation.findings.map((finding) => (
                            <li key={finding.findingId}>
                              <strong>{finding.ruleCode}</strong> — {finding.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <Disclosure className="builder-review__sql" title={<>Query v{reviewedVersion?.ordinal ?? "?"} SQL snapshot</>}>
                      <pre>{reviewedExecution.query.sql}</pre>
                    </Disclosure>
                  </Disclosure>
                </>
              )}
              {panel === "dataset" && reviewedDataset && <Disclosure className="builder-review__sql" title="Saved SQL and values">
                <pre>{String(reviewedDataset.configuration.parameterizedSql ?? "Saved SQL is unavailable.")}</pre>
                <p>Source: {String(reviewedDatasetSource?.dataSourceId ?? "Unknown")} · Dialect: {String(reviewedDatasetSource?.dialect ?? "Not recorded")}</p>
                <dl>{savedQueryDraft(reviewedDataset)?.parameters.map((parameter) => <div key={parameter.name}>
                  <dt>:{parameter.name} ({parameter.type})</dt><dd>{displayParameterValue(parameter.value)}</dd>
                </div>)}</dl>
                <Disclosure title="Recorded execution SQL"><pre>{String(reviewedDataset.configuration.compiledSql ?? "Not recorded")}</pre></Disclosure>
              </Disclosure>}
              {panel === "dataset" && datasetEvidenceLoading && (
                <p role="status">Loading exact Dataset execution evidence…</p>
              )}
              {panel === "dataset" && !datasetEvidenceLoading && (!reviewedSession || !reviewedExecution) && (
                <InlineNotification
                  kind="warning"
                  lowContrast
                  hideCloseButton
                  title="Execution evidence is unavailable in this session"
                  subtitle="Historical rows and run details could not be loaded. The saved SQL and values remain available for reuse."
                />
              )}

              {panel === "widget" && (
                <>
                  <div className="builder-widget-preview" role="img" aria-label={presentationPreview(presentationKind)}>
                    <span aria-hidden="true">▥</span>
                    <p>{presentationPreview(presentationKind)}</p>
                  </div>
                  <TextInput
                    id="builder-widget-title"
                    labelText="Chart name"
                    value={widgetTitle}
                    disabled={busy}
                    placeholder="Untitled chart"
                    onChange={(event) => setWidgetTitle(event.currentTarget.value)}
                  />
                  <Select
                    id="builder-widget-dataset"
                    labelText="Saved query"
                    value={effectiveDatasetVersionId}
                    disabled={busy}
                    onChange={(event) => {
                      const datasetVersionId = event.currentTarget.value;
                      const dataset =
                        datasets.find((candidate) => candidate.versionId === datasetVersionId) ?? null;
                      setSelectedDatasetVersionId(datasetVersionId);
                      setPlacementDashboardVersionId("");
                      setPresentationKind(suggestedPresentation(dataset));
                    }}
                  >
                    {datasets.map((dataset) => (
                      <SelectItem
                        key={dataset.versionId}
                        value={dataset.versionId}
                        text={entityTitle(dataset, "Dataset")}
                      />
                    ))}
                  </Select>
                  <Select
                    id="builder-presentation-kind"
                    labelText="Visualization"
                    value={presentationKind}
                    disabled={busy}
                    onChange={(event) => setPresentationKind(event.currentTarget.value as DashboardPresentationKind)}
                  >
                    {compatiblePresentations.map((assessment) => {
                      const presentation = presentations.find(
                        (candidate) => candidate.value === assessment.kind,
                      )!;
                      return (
                      <SelectItem key={presentation.value} value={presentation.value} text={presentation.label} />
                      );
                    })}
                  </Select>
                  <Select id="builder-widget-placement" labelText="Add to Dashboard"
                    value={placementDashboardVersionId} disabled={busy}
                    helperText="Choose a Dashboard using the same data source, or save the chart for later."
                    onChange={event => setPlacementDashboardVersionId(event.currentTarget.value)}>
                    <SelectItem value="" text="Save without placing" />
                    {placementDashboards.map(item => <SelectItem key={item.versionId} value={item.versionId}
                      text={entityTitle(item, "Dashboard")} />)}
                  </Select>
                  <section className="builder-review__evidence" aria-labelledby="widget-binding-title">
                    <h3 id="widget-binding-title">Chart binding</h3>
                    <p>
                      Suggested: {presentations.find((item) => item.value === suggestedKind)?.label}
                    </p>
                    <p>{presentationBindingSummary(selectedDataset, presentationKind)}</p>
                  </section>
                  <section className="builder-review__evidence" aria-labelledby="widget-compatibility-title">
                    <h3 id="widget-compatibility-title">Compatibility</h3>
                    <ul>
                      {selectedPresentationAssessments
                        .filter((assessment) => !assessment.compatible)
                        .map((assessment) => (
                          <li key={assessment.kind}>{assessment.reason}</li>
                        ))}
                    </ul>
                  </section>
                </>
              )}

              {panel === "dashboard" && (
                <>
                  <TextInput
                    id="builder-dashboard-title"
                    labelText="Dashboard name"
                    value={dashboardTitle}
                    disabled={busy}
                    placeholder="Catalyst dashboard"
                    onChange={(event) => setDashboardTitle(event.currentTarget.value)}
                  />
                  {selectedWidgetVersionIds.length > 0 && <DashboardArrangement
                    widgets={selectedWidgetVersionIds.flatMap(id => widgets.find(item => item.versionId === id) ?? [])}
                    widths={widgetWidths} disabled={busy}
                    onWidthChange={(id, width) => setWidgetWidths(current => ({ ...current, [id]: width }))}
                    onMove={(id, direction) => setSelectedWidgetVersionIds(current => {
                      const index = current.indexOf(id);
                      const destination = index + direction;
                      if (index < 0 || destination < 0 || destination >= current.length) return current;
                      const reordered = [...current];
                      [reordered[index], reordered[destination]] = [reordered[destination]!, reordered[index]!];
                      return reordered;
                    })}
                  />}
                  <fieldset className="builder-widget-picker">
                    <legend>Charts and tables</legend>
                    {widgets.map((widget) => (
                      <label key={widget.versionId}>
                        <input
                          type="checkbox"
                          checked={selectedWidgetVersionIds.includes(widget.versionId)}
                          disabled={busy}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setSelectedWidgetVersionIds((current) =>
                              checked
                                ? [...current, widget.versionId]
                                : current.filter((versionId) => versionId !== widget.versionId),
                            );
                          }}
                        />
                        <span>{entityTitle(widget, "Widget")}</span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
            </div>

            <footer className="builder-review__footer">
              {panel === "dataset" &&
                (reviewedDataset ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => openPanel("widget", reviewedDataset.versionId)}
                  >
                    Create a chart or table
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      !canSaveReviewedResult ||
                      datasetEvidenceLoading
                    }
                    onClick={() => void saveDataset()}
                  >
                    {busy ? "Saving…" : "Save query"}
                  </Button>
                ))}
              {panel === "dataset" && reviewedDataset && onReuseQuery && <Button type="button" kind="ghost"
                disabled={disabled || busy || !savedQueryDraft(reviewedDataset)}
                onClick={() => { setPanel(null); onReuseQuery(reviewedDataset); }}>Start from this SQL</Button>}
              {panel === "widget" && (
                <Button
                  type="button"
                  disabled={busy || !effectiveDatasetVersionId || (widgetUnchanged && !placementDashboardVersionId)}
                  onClick={() => void saveWidget()}
                >
                  {busy ? "Saving…" : placementDashboardVersionId ? widgetUnchanged ? "Add to Dashboard" : "Save chart and add" : widgetUnchanged ? "Saved" : reviewedWidgetVersionId ? "Save new chart version" : "Save chart or table"}
                </Button>
              )}
              {panel === "dashboard" && (
                <Button
                  type="button"
                  disabled={busy || selectedWidgetVersionIds.length === 0 || dashboardUnchanged}
                  onClick={() => void saveDashboard()}
                >
                  {busy ? "Saving…" : dashboardUnchanged ? "Saved" : reviewedDashboardVersionId ? "Save new Dashboard version" : "Save Dashboard"}
                </Button>
              )}
              <Button type="button" kind="tertiary" onClick={closePanel}>Close</Button>
            </footer>
          </aside>
        </>
      )}

      {toast && (
        <div className="builder-toast" role="status">
          <CheckmarkFilled size={20} aria-hidden="true" />
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <Close size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {publication && activeSection !== "dashboards" && (
        <Button
          className="builder-publication-shortcut"
          type="button"
          kind="ghost"
          renderIcon={Renew}
          onClick={() => onNavigate("dashboards")}
        >
          View published Dashboard
        </Button>
      )}
    </>
  );
};

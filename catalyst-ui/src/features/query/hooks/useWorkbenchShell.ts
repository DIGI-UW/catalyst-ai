import { useCallback, useEffect, useState } from "react";
import type { DetailsTab } from "../components/DetailsPanel";
import type { WorkspaceSection } from "../components/workbenchShellSupport";
import type {
  DashboardBuilderSection,
  WorkbenchSessionSummary,
} from "../types";

// Presentation preferences share one lifetime across all workspace sections.
export const useWorkbenchShell = () => {
  const [activeSection, updateActiveSection] = useState<DashboardBuilderSection>("ask");
  const [savedWorkSection, setSavedWorkSection] = useState<DashboardBuilderSection>("datasets");
  const setActiveSection = useCallback((section: DashboardBuilderSection) => {
    updateActiveSection(section);
    if (section !== "ask") setSavedWorkSection(section);
  }, []);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection | null>(null);
  const [activeTurnOrdinal, setActiveTurnOrdinal] = useState<number | null>(
    null,
  );
  const [sessionMenu, setSessionMenu] = useState<
    "closed" | "list" | "new" | "rename"
  >("closed");
  const [recentSessions, setRecentSessions] = useState<
    WorkbenchSessionSummary[]
  >([]);
  const [draftSessionName, setDraftSessionName] = useState("");
  const [detailsTurnId, setDetailsTurnId] = useState<string | null>(null);
  // Details can be scoped to the session rather than a turn: a gateway that
  // serves no per-turn evidence still records validation, provenance and
  // versions, and they must stay reachable.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("validation");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    activeSection,
    savedWorkSection,
    setActiveSection,
    workspaceSection,
    setWorkspaceSection,
    activeTurnOrdinal,
    setActiveTurnOrdinal,
    sessionMenu,
    setSessionMenu,
    recentSessions,
    setRecentSessions,
    draftSessionName,
    setDraftSessionName,
    detailsTurnId,
    setDetailsTurnId,
    detailsOpen,
    setDetailsOpen,
    detailsTab,
    setDetailsTab,
    advancedMode,
    setAdvancedMode,
    viewportWidth,
  };
};

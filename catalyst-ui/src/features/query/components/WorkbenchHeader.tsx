import { Button } from "@carbon/react";
import type { ThemePreference } from "../theme";
import type { DashboardBuilderSection, DataSource, WorkbenchSessionSummary } from "../types";
import type { WorkspaceSection, WorkspaceTurn } from "./workbenchShellSupport";
import "./WorkbenchHeader.css";

interface WorkbenchHeaderProps {
  inert?: boolean;
  sessionName: string | null;
  sessionSourceLabel: string | null;
  sessionMenu: "closed" | "list" | "new" | "rename";
  onSessionMenuChange: (menu: "closed" | "list" | "new" | "rename") => void;
  onRenameSession: (name: string) => void;
  recentSessions: WorkbenchSessionSummary[];
  onOpenSession: (sessionId: string) => void;
  activeSessionId: string | null;
  dataSources: DataSource[];
  draftSessionName: string;
  draftDataSourceId: string;
  onDraftSessionNameChange: (name: string) => void;
  onDraftDataSourceChange: (dataSourceId: string) => void;
  onStartSession: () => void;
  newSessionDisabled?: boolean;
  openSection: WorkspaceSection | null;
  onOpenSectionChange: (section: WorkspaceSection) => void;
  relationCount: number;
  turns: WorkspaceTurn[];
  activeTurnOrdinal: number | null;
  onSelectTurn: (ordinal: number) => void;
  onOpenDetails?: () => void;
  detailsOpen: boolean;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  advancedMode: boolean;
  onAdvancedModeChange: (enabled: boolean) => void;
  activeSection: DashboardBuilderSection;
  savedWorkSection: DashboardBuilderSection;
  onSectionChange: (section: DashboardBuilderSection) => void;
}

export const WorkbenchHeader = ({
  inert = false,
  sessionName,
  sessionSourceLabel,
  sessionMenu,
  onSessionMenuChange,
  onRenameSession,
  recentSessions,
  onOpenSession,
  activeSessionId,
  dataSources,
  draftSessionName,
  draftDataSourceId,
  onDraftSessionNameChange,
  onDraftDataSourceChange,
  onStartSession,
  newSessionDisabled = false,
  openSection,
  onOpenSectionChange,
  relationCount,
  turns,
  activeTurnOrdinal,
  onSelectTurn,
  onOpenDetails,
  detailsOpen,
  themePreference,
  onThemePreferenceChange,
  advancedMode,
  onAdvancedModeChange,
  activeSection,
  savedWorkSection,
  onSectionChange,
}: WorkbenchHeaderProps) => {
  const dataOpen = openSection === "data";
  const turnsOpen = openSection === "turns";
  return (
    <header inert={inert || undefined} className="workbench-header-shell" aria-label="Workspace navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          const disclosure = (event.target as HTMLElement).closest("details");
          if (disclosure?.open) {
            disclosure.open = false;
            disclosure.querySelector("summary")?.focus();
          }
          if (sessionMenu !== "closed") {
            const header = event.currentTarget;
            onSessionMenuChange("closed");
            requestAnimationFrame(() => header.querySelector<HTMLButtonElement>(".workbench-header-shell__session-button")?.focus());
          }
        }
      }}>
      <div className="workbench-header-shell__top">
        <div className="workbench-header-shell__brand">
          <span className="workbench-header-shell__mark" aria-hidden="true">C</span>
          <strong>Catalyst</strong>
        </div>
        <nav className="workbench-header-shell__nav" aria-label="Primary">
          <Button kind="ghost" aria-current={activeSection === "ask" ? "page" : undefined}
            onClick={() => onSectionChange("ask")}>Explore</Button>
          <Button kind="ghost" aria-current={activeSection !== "ask" ? "page" : undefined}
            onClick={() => onSectionChange(savedWorkSection)}>Saved work</Button>
        </nav>
        <div className="workbench-header-shell__session">
        {sessionMenu === "rename" && sessionName !== null ? (
          <form
            className="workbench-header-shell__session-rename"
            onSubmit={(event) => {
              event.preventDefault();
              onRenameSession(draftSessionName);
            }}
          >
            <label className="visually-hidden" htmlFor="catalyst-session-name">
              Session name
            </label>
            <input
              id="catalyst-session-name"
              autoFocus
              value={draftSessionName}
              placeholder="New session"
              onChange={(event) =>
                onDraftSessionNameChange(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") onSessionMenuChange("closed");
              }}
            />
            <Button size="sm" type="submit">Save name</Button>
          </form>
        ) : (
          <button
            type="button"
            className="workbench-header-shell__session-button"
            aria-label={`Session: ${sessionName ?? "none yet"}`}
            aria-expanded={sessionMenu !== "closed"}
            aria-controls="workspace-session-menu"
            onClick={() =>
              onSessionMenuChange(sessionMenu === "closed" ? "list" : "closed")
            }
          >
            <span>
              <strong>Using {sessionSourceLabel ?? "connected data"}</strong>
              <small>{sessionName ?? "Change data"}</small>
            </span>
            <span aria-hidden="true">▾</span>
          </button>
        )}

        {sessionMenu === "list" && (
          <div id="workspace-session-menu" className="workbench-header-shell__session-menu" role="group" aria-label="Sessions">
            {/* Pinned above a history that scrolls, so it is never buried. */}
            <button
              type="button"
              className="workbench-header-shell__session-new"
              onClick={() => onSessionMenuChange("new")}
            >
              <span aria-hidden="true">＋ </span>New session…
            </button>
            {sessionName !== null && (
              <button
                type="button"
                  className="workbench-header-shell__session-rename-action"
                onClick={() => onSessionMenuChange("rename")}
              >
                Rename session
              </button>
            )}
            <p className="workbench-header-shell__session-menu-title">
              Recent sessions
            </p>
            {recentSessions.length === 0 ? (
              <p className="workbench-header-shell__session-empty">
                No sessions recorded yet.
              </p>
            ) : (
              recentSessions.map((entry) => (
                <button
                  key={entry.sessionId}
                  type="button"
                      aria-current={
                    entry.sessionId === activeSessionId ? "true" : undefined
                  }
                  onClick={() => onOpenSession(entry.sessionId)}
                >
                  <span aria-hidden="true">
                    {entry.sessionId === activeSessionId ? "✓" : ""}
                  </span>
                  <span>
                    <span className="workbench-header-shell__session-entry-name">
                      {entry.name}
                    </span>
                    <span className="workbench-header-shell__session-entry-meta">
                      {[
                        dataSources.find(
                          (source) => source.id === entry.dataSourceId,
                        )?.label ?? entry.dataSourceId,
                        `${entry.turnCount} ${entry.turnCount === 1 ? "turn" : "turns"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {sessionMenu === "new" && (
          <div className="workbench-header-shell__session-menu workbench-header-shell__session-form">
            <p className="workbench-header-shell__session-menu-title">New session</p>
            <label>
              <span>Name</span>
              <input
                value={draftSessionName}
                placeholder="Optional — defaults to your first question"
                onChange={(event) =>
                  onDraftSessionNameChange(event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>Data source</span>
              <select
                value={draftDataSourceId}
                onChange={(event) =>
                  onDraftDataSourceChange(event.currentTarget.value)
                }
              >
                {dataSources.map((source) => (
                    <option key={source.id} value={source.id} disabled={!source.available}>
                      {source.label}{!source.available ? " (unavailable)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <p className="workbench-header-shell__session-note">
              Changing data starts a new session. Your previous sessions remain available.
            </p>
            <div className="workbench-header-shell__session-actions">
              <button
                type="button"
                className="workbench-header-shell__session-start"
                disabled={newSessionDisabled}
                onClick={onStartSession}
              >
                Start session
              </button>
              <button
                type="button"
                onClick={() => onSessionMenuChange("closed")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        </div>
        <details className="workbench-header-shell__view-options">
          <summary>
            View options
            {advancedMode && <span>Advanced</span>}
          </summary>
          <div className="workbench-header-shell__view-menu">
            <fieldset>
              <legend>Appearance</legend>
              {(["system", "light", "dark"] as ThemePreference[]).map(
                (preference) => (
                  <label key={preference}>
                    <input
                      type="radio"
                      name="catalyst-theme"
                      checked={themePreference === preference}
                      onChange={() => onThemePreferenceChange(preference)}
                    />
                    {preference === "system"
                      ? "System"
                      : preference[0]!.toUpperCase() + preference.slice(1)}
                  </label>
                ),
              )}
            </fieldset>
            <label className="workbench-header-shell__advanced">
              <input
                type="checkbox"
                checked={advancedMode}
                onChange={(event) =>
                  onAdvancedModeChange(event.currentTarget.checked)
                }
              />
              <span>
                <strong>Advanced mode</strong>
                <small>Show SQL, settings, and technical details.</small>
              </span>
            </label>
          </div>
        </details>
      </div>
      {activeSection !== "ask" && (
        <nav className="workbench-header-shell__saved" aria-label="Saved work">
          {([
            ["datasets", "Saved queries"], ["widgets", "Charts and tables"], ["dashboards", "Dashboards"],
          ] as const).map(([id, label]) => (
            <Button key={id} kind="ghost" size="sm"
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => onSectionChange(id)}>{label}</Button>
          ))}
        </nav>
      )}
      <div hidden={activeSection !== "ask"} className="workbench-header-shell__tools">
        <Button id="available-data-opener" kind="ghost" size="sm" aria-expanded={dataOpen}
          aria-controls="available-data-panel" onClick={() => onOpenSectionChange("data")}>
          What data is available?{advancedMode ? ` (${relationCount})` : ""}
        </Button>
        {turns.length > 0 && <Button kind="ghost" size="sm" aria-expanded={turnsOpen}
          aria-controls="workspace-turns" onClick={() => onOpenSectionChange("turns")}>
          Previous questions ({turns.length})
        </Button>}
        {onOpenDetails && <Button kind="ghost" size="sm" aria-expanded={detailsOpen}
          onClick={onOpenDetails}>Technical details</Button>}
      </div>
      <div id="workspace-turns" hidden={!turnsOpen || activeSection !== "ask"}>
        <ol className="workbench-header-shell__turns">
          {turns.map((turn) => (
            <li key={turn.ordinal}><Button kind="ghost" size="sm"
              aria-current={activeTurnOrdinal === turn.ordinal ? "true" : undefined}
              onClick={() => onSelectTurn(turn.ordinal)}>
              {turn.ordinal}. {turn.instruction}
            </Button></li>
          ))}
        </ol>
      </div>
    </header>
  );
};

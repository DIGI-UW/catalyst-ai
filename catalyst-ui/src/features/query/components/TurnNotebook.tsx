import { DataBase, WarningAltFilled } from "@carbon/icons-react";
import { Button, Select, SelectItem, Tag } from "@carbon/react";
import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  QueryProfile,
  WorkbenchExecution,
  WorkbenchQueryVersion,
  WorkbenchSession,
} from "../types";
import type { DetailsTab } from "./DetailsPanel";
import { lineDiffSummary } from "../lineDiff";
import { highlightSql } from "./sqlHighlight";
import { formatSql } from "./sqlEditorSupport";
import { ExecutionResult } from "./WorkbenchPanel";
import { QuestionComposerInput } from "./QuestionComposerInput";
import "./TurnNotebook.css";

/** The layout both diff sides share; unformattable text stays as written. */
const comparableSqlText = (sql: string, dialect = "sql"): string => {
  try {
    return formatSql(sql, dialect);
  } catch {
    return sql;
  }
};

type NotebookVersion = Pick<
  WorkbenchQueryVersion,
  "versionId" | "ordinal" | "authorType" | "queryDigest" | "provenance" | "sql"
>;

export interface NotebookOutputVersion {
  selected: boolean;
  role: "writer" | "reviewer";
  contractValid: boolean;
  version?: NotebookVersion;
  versionId?: string;
}

export interface NotebookTurn {
  turnId: string;
  ordinal: number;
  kind: "initial" | "followup";
  instruction: string;
  status: "requested" | "completed" | "failed";
  selectedVersionId: string | null;
  outputVersions: NotebookOutputVersion[];
  profileSnapshot: {
    profileName: string | null;
    writer: { modelId: string } | null;
    reviewer: { modelId: string } | null;
  };
  failure: {
    message: string;
    /** The failure's own code; `needs_clarification` is a question, not a fault. */
    code?: string;
    /** The model's own output was recorded and can be shown. */
    evidenceAvailable?: boolean;
    /** The named checks that failed, straight from the failure diagnostic. */
    checks?: { name: string; value: string }[];
  } | null;
  /** Run recorded against this turn's selected version, if it has been run. */
  execution?: WorkbenchExecution | null;
  /** Advisory validation status for this turn's selected version. */
  validationStatus?: "invalid" | "warning" | "valid" | null;
  /** True for the turn whose selected version is the session's current one. */
  current?: boolean;
  /** When this happened. The clock both kinds of cell share. */
  createdAt: string;
}

export interface NotebookGrounding {
  kind: "matching" | "stale" | "not-executed";
  text: string;
}

interface TurnNotebookProps {
  advancedMode?: boolean;
  turns: NotebookTurn[];
  session: WorkbenchSession;
  baseVersion: NotebookVersion | null;
  instruction: string;
  profiles: QueryProfile[];
  selectedProfileId: string;
  grounding: NotebookGrounding;
  editorEmpty: boolean;
  /** The session holds no query, so an empty editor is the right state:
   *  the writer asked or declined and this turn is the person's reply. */
  revisesNothing?: boolean;
  editorState?: "ready" | "empty" | "unresolved";
  busy: boolean;
  generating?: boolean;
  /** The last run failed, which pins the composer open on its error state. */
  lastRunFailed?: boolean;
  /** A failed workbench action, reported where the action was taken. */
  error?: string | null;
  onInstructionChange: (instruction: string) => void;
  onProfileChange: (profileId: string) => void;
  onGenerate: () => void;
  onCancel?: () => void;
  notice?: string | null;
  /** Open the Details panel scoped to this turn, on a chosen tab. */
  onOpenDetails: (turnId: string, tab?: DetailsTab) => void;
  /** Take the candidate a failed turn retained into the editor. */
  onEditAttempt?: (versionId: string) => void;
  /** Review the exact retained execution without changing the current query. */
  onReviewResult?: (executionId: string) => void;
  /**
   * The editable current query, rendered as the last cell in the stack: the
   * work in progress sits where the next committed turn will, rather than in
   * a panel detached from the thread it belongs to.
   */
  activeCell?: ReactNode;
  /** The active draft differs from the current version, so its cell says so. */
  draftDivergent?: boolean;
}

const textAt = (source: Record<string, unknown>, key: string) => {
  const value = source[key];
  return typeof value === "string" && value ? value : null;
};

const profileOptionLabel = (profile: QueryProfile) => {
  const writer = profile.roleModels.query_generate;
  const reviewer = profile.roleModels.query_review;
  const models = [
    writer ? `writer ${writer}` : null,
    reviewer ? `reviewer ${reviewer}` : null,
  ].filter((value): value is string => value !== null);
  return models.length > 0
    ? `${profile.label} — ${models.join("; ")}`
    : profile.label;
};

const versionAuthor = (version: NotebookVersion | null) => {
  if (!version) return "unresolved editor input";
  const collaborationRole = textAt(version.provenance, "collaborationRole");
  if (version.authorType === "model_repair" || collaborationRole === "reviewer") {
    return "reviewer correction";
  }
  if (version.authorType === "model") return "model writer";
  return version.authorType.replaceAll("_", " ");
};

const versionModel = (version: NotebookVersion | null) =>
  version ? textAt(version.provenance, "model") : null;

const selectedVersionOf = (turn: NotebookTurn): NotebookVersion | null =>
  turn.outputVersions.find((output) => output.selected)?.version ??
  turn.outputVersions.find(
    (output) => output.versionId === turn.selectedVersionId,
  )?.version ??
  null;

/**
 * Status is what the analyst reads from the gutter at a glance: whether this
 * turn produced a query that ran, and whether that run came back clean. A turn
 * whose generation failed never reaches a run, so it reports the same red as a
 * failed run rather than an absent one.
 */
type CellStatus = "succeeded" | "failed" | "not-run" | "answered";

const cellStatus = (turn: NotebookTurn): CellStatus => {
  // Collapsed, a cell is read by its colour and one word. A turn waiting on an
  // answer is not a fault, and must not be shown as one at either size.
  if (asksTheReader(turn)) return "answered";
  if (turn.status === "failed") return "failed";
  if (turn.execution?.status === "failed") return "failed";
  if (turn.execution?.status === "succeeded") return "succeeded";
  return "not-run";
};

const rowLabel = (count: number) => `${count} ${count === 1 ? "row" : "rows"}`;

/**
 * The writer ended the turn with words instead of a query: a question only the
 * person who asked can settle, or a refusal because the data cannot answer it.
 * Neither is a malfunction, so neither is drawn as one.
 */
const writerAnswered = (turn: NotebookTurn): "asked" | "declined" | null => {
  const code = turn.failure?.code;
  if (code === "needs_clarification") return "asked";
  if (code === "unsupported") return "declined";
  return null;
};

const asksTheReader = (turn: NotebookTurn) => writerAnswered(turn) !== null;

/**
 * Who wrote this cell's query, as its own channel.
 *
 * Outcome and authorship are different questions and cannot share one
 * attribute: a hand-edited cell that succeeded is both, and a collapsed header
 * showed neither. §10 gives purple to the model, so the gutter carries it.
 */
const cellAuthor = (turn: NotebookTurn): "model" | "human" | "reviewer" => {
  const version = selectedVersionOf(turn);
  if (!version) return "model";
  const collaborationRole = textAt(version.provenance, "collaborationRole");
  if (version.authorType === "model_repair" || collaborationRole === "reviewer") {
    return "reviewer";
  }
  return version.authorType === "human" ? "human" : "model";
};

/** The right-hand summary in a collapsed header: `v3 · 12 rows`. */
/**
 * A completed turn whose profile declares a reviewer, but whose selected
 * version no reviewer ever signed off: no reviewer output, and no recorded
 * query_review check. Silence here read as approval, which is the one thing
 * an unreviewed query must not do.
 */
const isUnreviewed = (turn: NotebookTurn, version: NotebookVersion | null) => {
  if (turn.status !== "completed") return false;
  if (!turn.profileSnapshot.reviewer) return false;
  if (turn.outputVersions.some((output) => output.role === "reviewer")) {
    return false;
  }
  const provenance = (version?.provenance ?? {}) as Record<string, unknown>;
  if (typeof provenance.collaborationRole === "string") return false;
  const validation = provenance.generationValidation as
    | { checks?: { name?: unknown }[] }
    | undefined;
  const reviewed = (validation?.checks ?? []).some(
    (check) => String(check?.name ?? "").startsWith("query_review"),
  );
  return !reviewed;
};

const cellOutcome = (turn: NotebookTurn) => {
  const answered = writerAnswered(turn);
  if (answered === "asked") return "needs your answer";
  if (answered === "declined") return "not supported";
  if (turn.status === "failed") return "generation failed";
  if (turn.status === "requested") return "generating…";
  const execution = turn.execution;
  if (!execution) return "not run";
  if (execution.status === "failed") return "run failed";
  const returned = execution.result?.rowCount.returned;
  return returned === undefined ? "ran" : rowLabel(returned);
};

const validationWord = (status: NotebookTurn["validationStatus"]) => {
  if (status === "valid") return "✓ valid";
  if (status === "warning") return "checked with warnings";
  if (status === "invalid") return "findings raised";
  return null;
};

export const TurnNotebook = ({
  advancedMode = false,
  turns,
  session,
  baseVersion,
  instruction,
  profiles,
  selectedProfileId,
  grounding,
  editorEmpty,
  revisesNothing = false,
  editorState = editorEmpty ? "empty" : "ready",
  busy,
  generating = false,
  lastRunFailed = false,
  error = null,
  onInstructionChange,
  onProfileChange,
  onGenerate,
  onCancel,
  notice,
  onOpenDetails,
  onEditAttempt,
  onReviewResult,
  activeCell = null,
  draftDivergent = false,
}: TurnNotebookProps) => {
  const [turnVisibilityOverrides, setTurnVisibilityOverrides] = useState<
    Record<string, boolean>
  >({});
  const revisionProfiles = useMemo(
    () => profiles.filter(
      (profile) => profile.available && profile.revisionCapable === true,
    ),
    [profiles],
  );
  const noRevisionProfiles = revisionProfiles.length === 0;
  const composerTitle = lastRunFailed ? "Try again" : revisesNothing ? "Your answer" : "Ask a follow-up";
  const latestTurnId = turns.at(-1)?.turnId ?? null;

  const toggleTurn = (turnId: string, expanded: boolean) => {
    setTurnVisibilityOverrides((current) => ({
      ...current,
      [turnId]: !expanded,
    }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if ((editorEmpty && !revisesNothing) || busy || noRevisionProfiles) return;
    onGenerate();
  };

  const renderCell = (turn: NotebookTurn) => {
    // Only the newest turn is open on arrival; everything earlier collapses to
    // its header so the thread stays scannable. An explicit toggle always wins.
    const expanded =
      turnVisibilityOverrides[turn.turnId] ?? turn.turnId === latestTurnId;
    const regionId = `query-turn-${turn.turnId}`;
    const status = cellStatus(turn);
    const version = selectedVersionOf(turn);
    const execution = turn.execution ?? null;
    const validation = validationWord(turn.validationStatus);
    const outcome = cellOutcome(turn);
    // The version this one succeeded, so the footer can offer the comparison
    // the analyst actually wants: what this turn changed.
    const parentVersion = (() => {
      const parentId = version
        ? session.versions.find((item) => item.versionId === version.versionId)
            ?.parentVersionId
        : null;
      if (!parentId) return null;
      return session.versions.find((item) => item.versionId === parentId) ?? null;
    })();
    const previousVersionOrdinal = parentVersion?.ordinal ?? null;
    // The one-glance answer to "how big was the hand edit?" — the full
    // comparison stays behind "what changed". Both sides go through the same
    // formatter first: the parent may be stored as the model's one dense line
    // while the edit was made on the formatted text, and a diff that counts
    // the reflow would report "+7 −1" for a one-line change.
    const editDiff =
      version?.authorType === "human" && parentVersion
        ? lineDiffSummary(
            comparableSqlText(parentVersion.sql),
            comparableSqlText(version.sql),
          )
        : null;
    // The visible header truncates the instruction to one line, so the
    // accessible name carries it in full alongside the run counter it is cited
    // by and the outcome the status dot encodes visually.
    const unreviewed = isUnreviewed(turn, version);
    const headerLabel =
      `Query turn ${turn.ordinal}: ${turn.instruction} — ${outcome}` +
      (unreviewed ? " — unreviewed" : "");

    return (
      <article
        className="query-turn"
        id={`turn-${turn.ordinal}`}
        key={turn.turnId}
        data-status={status}
        data-author={cellAuthor(turn)}
        data-current={turn.current ? "true" : undefined}
      >
        <div className="query-turn__gutter" aria-hidden="true">
          [{turn.ordinal}]
        </div>
        <div className="query-turn__body">
          <button
            type="button"
            className="query-turn__disclosure"
            aria-expanded={expanded}
            aria-controls={regionId}
            aria-label={headerLabel}
            onClick={() => toggleTurn(turn.turnId, expanded)}
          >
            <span className="query-turn__dot" aria-hidden="true" />
            <span className="query-turn__summary">{turn.instruction}</span>
            {/*
              Visible while the cell is collapsed, because that is exactly when
              an unreviewed query would otherwise pass unnoticed.
            */}
            {unreviewed && (
              <span className="query-turn__unreviewed">unreviewed</span>
            )}
            <span className="query-turn__outcome">{outcome}</span>
            <span className="query-turn__caret" aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
          </button>

          {expanded && (
            <section
              id={regionId}
              className="query-turn__detail"
              aria-label={`Query turn ${turn.ordinal}`}
            >
              {turn.status === "failed" && (
                <div
                  className={
                    asksTheReader(turn)
                      ? "query-turn__failure query-turn__failure--answered"
                      : "query-turn__failure"
                  }
                  role="status"
                >
                  <strong>
                    {writerAnswered(turn) === "asked"
                      ? "Needs your answer"
                      : writerAnswered(turn) === "declined"
                        ? "Not supported by this data"
                        : "Generation failed"}
                  </strong>
                  <p>
                    {turn.failure?.message ?? "The generation did not complete."}
                  </p>
                  {/*
                    Which checks failed, by name, so the reason is readable
                    here rather than only in Evidence.
                  */}
                  {turn.failure?.checks && turn.failure.checks.length > 0 && (
                    <dl className="query-turn__failure-checks">
                      {turn.failure.checks.map((check) => (
                        <div key={check.name}>
                          <dt>{check.name}</dt>
                          <dd>{check.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {/*
                    What the model actually returned settles any question this
                    summary leaves open, and it is already recorded.
                  */}
                  {turn.failure?.evidenceAvailable && (
                    <button
                      type="button"
                      className="query-turn__footer-link"
                      onClick={() => onOpenDetails(turn.turnId, "evidence")}
                    >
                      Show the model's output
                    </button>
                  )}
                </div>
              )}

              {execution?.status === "succeeded" && (
                <div className="query-turn__dataset">
                  <div className="query-turn__dataset-heading">
                    <DataBase size={20} aria-hidden="true" />
                    <div className="query-turn__result-summary">
                      <strong>Results ready</strong>
                      <p>{execution.result
                        ? `${rowLabel(execution.result.rowCount.returned)} · ${execution.result.columns.length} ${execution.result.columns.length === 1 ? "column" : "columns"}`
                        : "The query completed without a table."}</p>
                      {turn.current && grounding.kind === "stale" && <p>Earlier result — your query has changed.</p>}
                      {execution.result?.rowCount.truncated && <p>Limited result; more rows may be available.</p>}
                      {turn.validationStatus && turn.validationStatus !== "valid" && <p>Review the query findings before using these results.</p>}
                    </div>
                    {onReviewResult && (
                      <Button type="button" kind="tertiary" size="sm"
                        onClick={() => onReviewResult(execution.executionId)}>
                        Review results
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {execution?.status === "failed" && (
                <ExecutionResult
                  session={session}
                  sql={version?.sql ?? execution.query.sql}
                  parameters={execution.query.parameters}
                  executionOverride={execution}
                  immutableSnapshot
                  compact
                  pageSize={10}
                />
              )}

              <details className="query-turn__technical" open={advancedMode}>
                <summary>Technical details</summary>
              {version && (
                <div
                  className="query-turn__sql"
                  data-author={
                    version.authorType === "human" ? "human" : undefined
                  }
                >
                  <p className="query-turn__sql-label">
                    {versionAuthor(version)}
                    {versionModel(version) ? ` · ${versionModel(version)}` : ""}
                  </p>
                  {/*
                    Highlighted by parsing, not by mounting an editor: a long
                    thread would otherwise pay for one CodeMirror view per
                    cell to render text nobody can type into.
                  */}
                  <pre>
                    {highlightSql(version.sql).map((span, index) => (
                      <span
                        className={span.className}
                        key={`${index}-${span.text.length}`}
                      >
                        {span.text}
                      </span>
                    ))}
                  </pre>
                </div>
              )}

              {turn.profileSnapshot.profileName && (
                <p className="query-turn__profile">
                  Generated by {turn.profileSnapshot.profileName}
                  {turn.profileSnapshot.writer
                    ? ` · ${turn.profileSnapshot.writer.modelId} writer`
                    : ""}
                  {turn.profileSnapshot.reviewer
                    ? ` · ${turn.profileSnapshot.reviewer.modelId} reviewer`
                    : ""}
                </p>
              )}

              {turn.outputVersions
                .filter((output) => !output.selected && output.version)
                .map((output, index) => {
                  const retained =
                    turn.status === "failed" && output.role === "writer";
                  return (
                    <p
                      className="query-turn__superseded"
                      key={`${output.version!.versionId}-${index}`}
                    >
                      {retained
                        ? "Structured writer output — not selected"
                        : `${output.role} output — superseded`}
                      {/*
                        The attempt a failed turn kept is the shortest route
                        back to a working query, so the cell that reports the
                        failure is where it can be picked up.
                      */}
                      {retained && onEditAttempt && (
                        <button
                          type="button"
                          className="query-turn__footer-link"
                          onClick={() =>
                            onEditAttempt(output.version!.versionId)
                          }
                        >
                          Edit this attempt
                        </button>
                      )}
                    </p>
                  );
                })}

              <div className="query-turn__footer">
                {validation && (
                  <span className="query-turn__footer-item">{validation}</span>
                )}
                {execution?.status === "succeeded" &&
                  execution.result !== undefined && (
                    <span className="query-turn__footer-item">
                      {rowLabel(execution.result.rowCount.returned)}
                    </span>
                  )}
                {execution && (
                  <span className="query-turn__footer-item">
                    {execution.durationMs} ms
                  </span>
                )}
                {editDiff && (editDiff.added > 0 || editDiff.removed > 0) && (
                  <span className="query-turn__footer-item">
                    +{editDiff.added} −{editDiff.removed} vs [
                    {previousVersionOrdinal}]
                  </span>
                )}
                {turn.current && execution && (
                  <span className="query-turn__footer-note">
                    {execution.status === "failed"
                      ? "The database diagnostic is available to the model; result row values are not."
                      : "Result row values are not included in model context."}
                  </span>
                )}
                <button
                  type="button"
                  className="query-turn__footer-link"
                  onClick={() => onOpenDetails(turn.turnId)}
                >
                  details
                </button>
                {previousVersionOrdinal !== null && version && (
                  <button
                    type="button"
                    className="query-turn__footer-link"
                    onClick={() => onOpenDetails(turn.turnId, "versions")}
                  >
                    what changed
                  </button>
                )}
              </div>
              </details>
            </section>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="turn-notebook" data-advanced={advancedMode ? "true" : undefined} aria-label="Iterative query notebook">
      <ol className="turn-notebook__timeline">
        {turns.map((turn) => (
          <li key={turn.turnId}>{renderCell(turn)}</li>
        ))}
        {activeCell && (
          <li>
            <article
              className={`query-turn query-turn--active${
                draftDivergent ? " query-turn--provisional" : ""
              }`}
            >
              <div className="query-turn__gutter" aria-hidden="true">
                [{turns.length + 1}]
              </div>
              <div className="query-turn__body">
                {draftDivergent && (
                  <p className="query-turn__provisional" role="status">
                    You have edited the query. Get results to review the changes.
                  </p>
                )}
                {activeCell}
              </div>
            </article>
          </li>
        )}
        {advancedMode && !activeCell && !generating && (
          <li className="turn-notebook__composing" aria-hidden="true">
            <span className="query-turn__gutter">[{turns.length + 1}]</span>
            <span>composing…</span>
          </li>
        )}
        {/*
          Where the answer will appear, from the moment it is asked for. The
          composer's busy label is the only other signal and it can be
          scrolled out of sight, which reads as nothing happening at all.
        */}
        {generating && (
          <li>
            <article className="query-turn query-turn--pending">
              <div className="query-turn__gutter" aria-hidden="true">
                [{turns.length + (activeCell ? 2 : 1)}]
              </div>
              <div className="query-turn__body">
                <p className="query-turn__pending" role="status">
                  <span className="query-turn__pending-dot" aria-hidden="true" />
                  Generating the next query…
                </p>
              </div>
            </article>
          </li>
        )}
      </ol>

      <section
        id="refine-openelis"
        className="turn-composer"
        aria-labelledby="refine-query-title"
        data-query-composer-dock
        data-failed={lastRunFailed ? "true" : undefined}
      >
        <div className="turn-composer__heading">
          <div className="turn-composer__title">
            <h2 id="refine-query-title" className="visually-hidden">{composerTitle}</h2>
            <p>{draftDivergent ? "Using your edited query" : `Refining “${turns.at(-1)?.instruction ?? session.question}”`}</p>
            {advancedMode && (baseVersion ? (
              <p>
                {versionAuthor(baseVersion)}
                {versionModel(baseVersion) ? ` — ${versionModel(baseVersion)}` : ""}
              </p>
            ) : (
              <p>Based on unresolved editor input</p>
            ))}
          </div>
          {editorState === "unresolved" && (
            <Tag type="warm-gray">Unresolved editor input</Tag>
          )}
        </div>
        <form
          id="refine-openelis-body"
          className="turn-composer__form"
          onSubmit={handleSubmit}
        >
          <QuestionComposerInput
            id="catalyst-followup"
            label={revisesNothing ? "Your answer" : "Ask a follow-up"}
            placeholder={
              revisesNothing
                ? "Answer the question so Catalyst can prepare the query"
                : "Ask another question or describe what you want changed"
            }
            value={instruction}
            disabled={busy}
            submitDisabled={
              !instruction.trim() ||
              (editorEmpty && !revisesNothing) ||
              busy ||
              noRevisionProfiles
            }
            onChange={onInstructionChange}
            onSubmit={onGenerate}
          />
          <div className="turn-composer__toolbar">
            <details className="query-settings" open={advancedMode}>
              <summary>Query settings</summary>
              <Select
                id="catalyst-followup-profile"
                labelText="Model profile"
                size="sm"
                value={noRevisionProfiles ? "" : selectedProfileId}
                disabled={busy || noRevisionProfiles}
                onChange={(event) => onProfileChange(event.currentTarget.value)}
              >
                {noRevisionProfiles && <SelectItem value="" text="No revision-capable profile available" />}
                {revisionProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id} text={profileOptionLabel(profile)} />
                ))}
              </Select>
            </details>
            {error && (
              <p className="turn-composer__error" role="alert">
                {error}
              </p>
            )}
            {grounding.kind === "stale" && (
              <span
                className="turn-composer__stale"
                role="img"
                aria-label={grounding.text}
                title={grounding.text}
              >
                <WarningAltFilled aria-hidden="true" />
              </span>
            )}
            {generating && onCancel ? <Button type="button" kind="tertiary" onClick={(event) => {
              // Aborting can restore the submit button before this click ends.
              event.preventDefault();
              onCancel();
            }}>
              Stop preparing
            </Button> : <Button
              type="submit"
              disabled={
                !instruction.trim() ||
                (editorEmpty && !revisesNothing) ||
                busy ||
                noRevisionProfiles
              }
              aria-describedby={
                noRevisionProfiles
                  ? "catalyst-followup-profile-unavailable"
                  : undefined
              }
            >
              {generating
                ? "Preparing…"
                : lastRunFailed || error || notice
                  ? "Retry"
                  : "Continue"}
            </Button>}
          </div>
          {notice && <p className="query-composer__help" role="status">{notice}</p>}
          {noRevisionProfiles && (
            <p id="catalyst-followup-profile-unavailable" role="status">
              No revision-capable model profile is currently available. Load a
              configured model profile to generate the next query.
            </p>
          )}
        </form>
      </section>

    </section>
  );
};

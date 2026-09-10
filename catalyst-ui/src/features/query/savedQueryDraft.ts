import type { BoundParameter, DashboardBuilderEntity, WorkbenchSession } from "./types";

export interface SessionDraft {
  baseVersionId: string | null;
  question: string;
  instruction: string;
  sql: string;
  parameters: BoundParameter[];
  editorOpen: boolean;
}

export interface SavedQueryOrigin {
  versionId: string;
  title: string;
  dataSourceId: string;
  dialect: string | null;
  previousSessionId: string | null;
}

const text = (value: unknown): value is string => typeof value === "string";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parameters = (value: unknown): value is BoundParameter[] =>
  Array.isArray(value) && value.every((item) => record(item) &&
    typeof item.name === "string" && "value" in item &&
    ["string", "integer", "number", "boolean", "date", "date-time", "string-list", "integer-list"].includes(String(item.type)) &&
    (item.source === "question" || item.source === "human"));

export const savedQueryDraft = (dataset: DashboardBuilderEntity) => {
  const config = dataset.configuration;
  const source = config.source;
  if (!record(source) || typeof source.dataSourceId !== "string" || !source.dataSourceId ||
      typeof config.parameterizedSql !== "string" || !config.parameterizedSql.trim() ||
      !parameters(config.parameters)) return null;
  return {
    sql: config.parameterizedSql,
    parameters: structuredClone(config.parameters),
    sourceId: source.dataSourceId,
    dialect: typeof source.dialect === "string" ? source.dialect : null,
    title: typeof config.title === "string" ? config.title : "Saved query",
  };
};

export const sessionDraft = (session: WorkbenchSession): SessionDraft | null => {
  const draft = session.browserState.editorDraft;
  if (!record(draft) || draft.baseVersionId !== session.currentVersionId ||
      typeof draft.question !== "string" || typeof draft.instruction !== "string" ||
      !text(draft.sql) || !parameters(draft.parameters) ||
      typeof draft.editorOpen !== "boolean") return null;
  return draft as unknown as SessionDraft;
};

export const savedQueryOrigin = (session: WorkbenchSession | null): SavedQueryOrigin | null => {
  const origin = session?.browserState.savedQueryOrigin;
  if (!record(origin) || typeof origin.versionId !== "string" ||
      typeof origin.title !== "string" || typeof origin.dataSourceId !== "string" ||
      !(origin.dialect === null || typeof origin.dialect === "string") ||
      !(origin.previousSessionId === null || typeof origin.previousSessionId === "string")) return null;
  return origin as unknown as SavedQueryOrigin;
};

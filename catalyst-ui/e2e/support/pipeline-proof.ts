import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export async function expectDisplayedWarehouse(page: Page, root: string) {
  const banner = page.locator(".alert").filter({
    has: page.getByText("Latest:", { exact: true }),
  });
  await expect(banner).toBeVisible();
  const displayed = await banner.evaluate(
    (element: {
      childNodes: ArrayLike<{ nodeType: number; textContent: string | null }>;
    }) =>
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === 3 /* TEXT_NODE */)
        .map((node) => node.textContent)
        .join("")
        .trim(),
  );
  expect(displayed).toBe(root);
}

export type PipelineSnapshot = { status: string; root: string | null };
export type PipelineBaseline = {
  container: string;
  identity: string;
  cursor: string;
  mode: "FULL" | "INCREMENTAL";
  snapshot: PipelineSnapshot;
};
export type PipelineObservation = {
  identity: string;
  logs: string;
  snapshot: PipelineSnapshot;
};
export type PipelineCompletion = {
  complete: boolean;
  failed: boolean;
  reason: string;
  root?: string;
  thread?: string;
};

const docker = (args: string[]) =>
  execFileSync(
    "sh",
    ["-c", 'exec docker "$@" 2>&1', "pipeline-proof", ...args],
    {
      encoding: "utf-8",
      timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
const identity = (container: string) =>
  docker([
    "inspect",
    "--format",
    "{{.Id}} {{.State.StartedAt}}",
    container,
  ]).trim();

export async function readPipelineSnapshot(
  request: APIRequestContext,
  url: string,
): Promise<PipelineSnapshot> {
  try {
    const status = await request.get(`${url}/status`, { timeout: 10_000 });
    if (!status.ok()) return { status: "UNAVAILABLE", root: null };
    const body = await status.json();
    const dwh = await request.get(`${url}/dwh`, { timeout: 10_000 });
    if (!dwh.ok()) return { status: "UNAVAILABLE", root: null };
    const warehouse = await dwh.json();
    return {
      status:
        typeof body?.pipelineStatus === "string"
          ? body.pipelineStatus
          : "UNKNOWN",
      root:
        typeof warehouse?.dwh_path_latest === "string"
          ? warehouse.dwh_path_latest
          : null,
    };
  } catch {
    return { status: "UNAVAILABLE", root: null };
  }
}

export async function capturePipelineBaseline(
  request: APIRequestContext,
  url: string,
  container: string,
  mode: "FULL" | "INCREMENTAL",
): Promise<PipelineBaseline> {
  const snapshot = await readPipelineSnapshot(request, url);
  if (snapshot.status !== "IDLE") {
    throw new Error(
      `Pipeline must be IDLE before the demo; got ${snapshot.status}`,
    );
  }
  const containerIdentity = identity(container);
  const cursor =
    docker(["logs", "--timestamps", "--tail", "1", container])
      .trimEnd()
      .split("\n")
      .at(-1) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\S+Z /.test(cursor)) {
    throw new Error("Cannot capture a timestamped pipeline log boundary");
  }
  return { container, identity: containerIdentity, cursor, mode, snapshot };
}

export async function observePipeline(
  request: APIRequestContext,
  url: string,
  baseline: PipelineBaseline,
): Promise<PipelineObservation> {
  return {
    snapshot: await readPipelineSnapshot(request, url),
    // A single merged pipe preserves both streams, including error records.
    logs: docker([
      "logs",
      "--timestamps",
      "--since",
      baseline.cursor.slice(0, baseline.cursor.indexOf(" ")),
      baseline.container,
    ]),
    identity: identity(baseline.container),
  };
}

/** Completion evidence for the pinned controller, not a general pipeline API. */
export function pipelineCompletion(
  baseline: PipelineBaseline,
  observation: PipelineObservation,
): PipelineCompletion {
  const incomplete = (reason: string, failed = false): PipelineCompletion => ({
    complete: false,
    failed,
    reason,
  });
  if (observation.identity !== baseline.identity)
    return incomplete(
      "Pipeline container changed during the observation",
      true,
    );
  const boundary = observation.logs.lastIndexOf(baseline.cursor);
  if (boundary < 0)
    return incomplete(
      "Pipeline log boundary is missing; completion evidence is incomplete",
      true,
    );

  // Docker timestamps delimit records; class and operation-thread identity keep
  // another run's progress from satisfying this run's completion check.
  const events = observation.logs
    .slice(boundary + baseline.cursor.length)
    .split("\n")
    .flatMap((line) => {
      const match = line.match(
        /^\d{4}-\d{2}-\d{2}T\S+Z \d{2}:\d{2}:\d{2}\.\d+ \[([^\]]+)\]\s+(INFO|WARN|ERROR|DEBUG)\s+\S+\.([^. ]+) \S+ - (.*)$/,
      );
      return match
        ? [
            {
              thread: match[1] ?? "",
              level: match[2] ?? "",
              logger: match[3] ?? "",
              message: match[4] ?? "",
            },
          ]
        : [];
    });
  const requests = events.filter(
    (event) =>
      event.logger === "ApiController" &&
      event.message === "Received request to start the pipeline ...",
  );
  const starts = events.filter(
    (event) =>
      event.logger === "PipelineManager" &&
      event.message.startsWith(
        "Pipelines execution started with a new thread;",
      ),
  );
  if (starts.length > 1 || requests.length > 1)
    return incomplete(
      "Multiple pipeline starts make this run's evidence ambiguous",
      true,
    );
  const start = starts[0];
  const request = requests[0];
  if (!start || !request)
    return incomplete("Waiting for the accepted pipeline's operation start");
  if (events.indexOf(request) >= events.indexOf(start))
    return incomplete("Pipeline started before its recorded request", true);
  const operation = events
    .slice(events.indexOf(start))
    .filter((event) => event.thread === start.thread);
  const finished = operation.findIndex(
    (event) =>
      event.logger === "PipelineManager" &&
      event.message.startsWith("Total time taken for the pipelines = "),
  );
  const error = operation.find((event) => event.level === "ERROR");
  if (error)
    return incomplete(
      `Pipeline operation reported an error: ${error.message}`,
      true,
    );
  if (finished < 0)
    return incomplete("Waiting for the pipeline operation to finish");
  if (
    operation.some(
      (event) =>
        event.logger === "PipelineManager" &&
        event.message === "No resources found to be fetched!",
    )
  ) {
    return incomplete(
      "Pipeline fetched no changed resources: no new materialization was produced. This is not a pipeline failure; choose FULL explicitly if the demo needs a fresh snapshot.",
      true,
    );
  }
  if (observation.snapshot.status !== "IDLE")
    return incomplete(
      `Pipeline status is ${observation.snapshot.status || "UNKNOWN"}, not IDLE`,
    );
  const root = observation.snapshot.root;
  const normalize = (value: string | null) => value?.replace(/\/+$/, "") ?? "";
  if (!root || normalize(root) === normalize(baseline.snapshot.root))
    return incomplete("No new warehouse snapshot is visible");

  const modeStarts = events.filter(
    (event) =>
      event.logger === "PipelineManager" &&
      /^Running (full|incremental) pipeline for DWH /.test(event.message),
  );
  const modeStart = modeStarts[0];
  if (
    !modeStart ||
    modeStarts.length !== 1 ||
    modeStart.thread !== request.thread ||
    events.indexOf(modeStart) >= events.indexOf(start)
  ) {
    return incomplete(
      "Cannot tie the requested mode to this pipeline operation",
      true,
    );
  }
  const mode = modeStart.message.match(
    /^Running (full|incremental) pipeline for DWH (\S+)(?: since .*)?$/,
  );
  const modeName = mode?.[1];
  const modeRoot = mode?.[2];
  const inputRoot = baseline.mode === "FULL" ? root : baseline.snapshot.root;
  if (
    !modeName ||
    !modeRoot ||
    modeName.toUpperCase() !== baseline.mode ||
    normalize(modeRoot) !== normalize(inputRoot)
  ) {
    return incomplete(
      "The observed pipeline mode or warehouse does not match the accepted request",
      true,
    );
  }

  const sqlIndexes = operation.flatMap((event, index) =>
    event.logger === "HiveTableManager" &&
    event.message.startsWith("Executing SQL query: CREATE TABLE ")
      ? [{ index, message: event.message }]
      : [],
  );
  const registered = operation.findIndex(
    (event) =>
      event.logger === "PipelineManager" &&
      event.message === "Created resources on Thrift server Hive",
  );
  if (
    !sqlIndexes.length ||
    registered < 0 ||
    registered >= finished ||
    sqlIndexes.some(({ index }) => index >= registered)
  ) {
    return incomplete(
      "Finished pipeline lacks ordered Spark registration success",
      true,
    );
  }
  if (
    sqlIndexes.some(
      ({ message }) =>
        !message
          .match(/\bLOCATION '([^']+)'/)?.[1]
          ?.startsWith(`${normalize(root)}/`),
    )
  ) {
    return incomplete(
      "Spark registration does not reference the new warehouse snapshot",
      true,
    );
  }
  return {
    complete: true,
    failed: false,
    reason: "Fresh warehouse registered and pipeline completed",
    root,
    thread: start.thread,
  };
}

import { createServer } from "node:http";
import { request as playwrightRequest } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
  pipelineCompletion,
  readPipelineSnapshot,
  type PipelineBaseline,
  type PipelineObservation,
} from "../../e2e/support/pipeline-proof";

// The pinned controller's observed log format; these test the demo's evidence
// interpretation, not the FHIR or Spark implementation.
const oldRoot = "/dwh/source_DWH_TIMESTAMP_old";
const newRoot = "/dwh/source_DWH_TIMESTAMP_new";
const line = (
  thread: string,
  logger: string,
  message: string,
  level = "INFO",
) =>
  `2026-09-08T03:31:10.000000000Z 03:31:10.000 [${thread}] ${level}  c.g.fhir.analytics.${logger} com.google.fhir.analytics.${logger}.run:1 - ${message}`;
const cursor =
  "2026-09-08T03:31:09.000000000Z 03:31:09.000 [scheduler] INFO  boundary";
const baseline: PipelineBaseline = {
  container: "pipeline",
  identity: "container start-time",
  cursor,
  mode: "FULL",
  snapshot: { status: "IDLE", root: oldRoot },
};
const request = line(
  "http-1",
  "ApiController",
  "Received request to start the pipeline ...",
);
const full = line(
  "http-1",
  "PipelineManager",
  `Running full pipeline for DWH ${newRoot}`,
);
const start = line(
  "Thread-1",
  "PipelineManager",
  "Pipelines execution started with a new thread; number of threads is 19",
);
const sql = line(
  "Thread-1",
  "HiveTableManager",
  `Executing SQL query: CREATE TABLE IF NOT EXISTS Patient_123 USING PARQUET LOCATION '${newRoot}/Patient'`,
);
const registered = line(
  "Thread-1",
  "PipelineManager",
  "Created resources on Thrift server Hive",
);
const end = line(
  "Thread-1",
  "PipelineManager",
  "Total time taken for the pipelines = 10 secs",
);
const goodLogs = [cursor, request, full, start, sql, registered, end].join(
  "\n",
);
const successful: PipelineObservation = {
  identity: baseline.identity,
  logs: goodLogs,
  snapshot: { status: "IDLE", root: newRoot },
};

describe("pipeline completion evidence", () => {
  it.each([
    [503, "temporarily unavailable", "UNAVAILABLE"],
    [200, "not JSON", "UNAVAILABLE"],
    [200, "{}", "UNKNOWN"],
  ] as const)(
    "does not accept a real HTTP %s status response containing %s",
    async (status, body, expected) => {
      const server = createServer((incoming, response) => {
        response.writeHead(incoming.url === "/status" ? status : 200, {
          "Content-Type": "application/json",
        });
        response.end(
          incoming.url === "/status"
            ? body
            : JSON.stringify({ dwh_path_latest: newRoot }),
        );
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("HTTP fixture has no port");
      const client = await playwrightRequest.newContext();
      try {
        const snapshot = await readPipelineSnapshot(
          client,
          `http://127.0.0.1:${address.port}`,
        );
        expect(snapshot.status).toBe(expected);
        expect(
          pipelineCompletion(baseline, { ...successful, snapshot }).complete,
        ).toBe(false);
      } finally {
        await client.dispose();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it("accepts a single fresh, registered and completed full run", () => {
    expect(pipelineCompletion(baseline, successful)).toMatchObject({
      complete: true,
      root: newRoot,
      thread: "Thread-1",
    });
  });

  it("accepts incremental registration of the new root, not its old input", () => {
    const incremental = line(
      "http-1",
      "PipelineManager",
      `Running incremental pipeline for DWH ${oldRoot} since yesterday`,
    );
    expect(
      pipelineCompletion(
        { ...baseline, mode: "INCREMENTAL" },
        { ...successful, logs: goodLogs.replace(full, incremental) },
      ).complete,
    ).toBe(true);
  });

  it.each(["UNAVAILABLE", "UNKNOWN", "RUNNING", "", "FAILED"])(
    "does not treat %s status as completion",
    (status) => {
      expect(
        pipelineCompletion(baseline, {
          ...successful,
          snapshot: { status, root: newRoot },
        }).complete,
      ).toBe(false);
    },
  );

  it("rejects stale IDLE and an existing warehouse", () => {
    expect(
      pipelineCompletion(baseline, {
        ...successful,
        logs: cursor,
        snapshot: baseline.snapshot,
      }).complete,
    ).toBe(false);
  });

  it("rejects success logs retained before the captured boundary", () => {
    expect(
      pipelineCompletion(baseline, {
        ...successful,
        logs: goodLogs + "\n" + cursor,
      }).complete,
    ).toBe(false);
  });

  it.each([
    ["missing registration", goodLogs.replace(registered, "")],
    [
      "different registration thread",
      goodLogs.replace(registered, registered.replace("Thread-1", "Thread-2")),
    ],
    [
      "registration before SQL",
      [cursor, request, full, start, registered, sql, end].join("\n"),
    ],
    ["wrong root", goodLogs.replace(sql, sql.replace(newRoot, oldRoot))],
    ["multiple runs", goodLogs + "\n" + start.replace("Thread-1", "Thread-2")],
    ["truncated logs", goodLogs.replace(cursor, "")],
  ])("rejects %s", (_name, logs) => {
    expect(pipelineCompletion(baseline, { ...successful, logs }).complete).toBe(
      false,
    );
  });

  it("rejects a swallowed registration error even when IDLE and the root advanced", () => {
    const error = line(
      "Thread-1",
      "PipelineManager",
      "Exception while creating resource table on thriftserver",
      "ERROR",
    );
    expect(
      pipelineCompletion(baseline, {
        ...successful,
        logs: goodLogs.replace(end, error + "\n" + end),
      }),
    ).toMatchObject({ complete: false, failed: true });
  });

  it("reports an incremental no-op as no new materialization, not pipeline failure", () => {
    const logs = [
      cursor,
      request,
      line(
        "http-1",
        "PipelineManager",
        `Running incremental pipeline for DWH ${oldRoot} since yesterday`,
      ),
      start,
      line(
        "Thread-1",
        "PipelineManager",
        "No resources found to be fetched!",
        "WARN",
      ),
      end,
    ].join("\n");
    const result = pipelineCompletion(
      { ...baseline, mode: "INCREMENTAL" },
      { ...successful, logs, snapshot: baseline.snapshot },
    );
    expect(result).toMatchObject({ complete: false, failed: true });
    expect(result.reason).toContain("no new materialization");
  });

  it("rejects a replaced or restarted container", () => {
    expect(
      pipelineCompletion(baseline, {
        ...successful,
        identity: "another container start",
      }).complete,
    ).toBe(false);
  });
});

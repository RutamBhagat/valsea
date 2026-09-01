import { benchmarkManifest } from "@valsea/benchmark";
import { and, db, desc, eq } from "@valsea/db";
import {
  benchmarkRun,
  comparisonRun,
  providerRun,
  type BenchmarkResultJson,
} from "@valsea/db/schema/index";
import { Elysia, t } from "elysia";

import { authPlugin } from "../plugins/auth";
import { runBenchmark } from "../services/benchmark-runner";

const DEFAULT_SAMPLE_COUNT = 5;
const activeExecutions = new Set<string>();

export function createOrGetActiveBenchmark(userId: string, sampleCount = DEFAULT_SAMPLE_COUNT) {
  const [activeRun] = db
    .select({ id: benchmarkRun.id })
    .from(benchmarkRun)
    .where(and(eq(benchmarkRun.userId, userId), eq(benchmarkRun.status, "running")))
    .orderBy(desc(benchmarkRun.createdAt))
    .limit(1)
    .all();

  if (activeRun) return { benchmarkRunId: activeRun.id };

  const id = crypto.randomUUID();
  const selectedSampleIds = benchmarkManifest.samples
    .slice(0, sampleCount)
    .map(({ row_index }) => `part4-${row_index.toString().padStart(4, "0")}`);
  const resultJson: BenchmarkResultJson = {
    manifestVersion: benchmarkManifest.version,
    selectedSampleIds,
    sampleCount,
    providerResults: [],
    summary: [],
    failures: [],
    requestProgress: {
      completed: 0,
      total: sampleCount * 3,
    },
  };

  db.insert(benchmarkRun).values({ id, userId, status: "running", resultJson }).run();

  return { benchmarkRunId: id };
}

export function getBenchmark(userId: string, id: string) {
  return db
    .select()
    .from(benchmarkRun)
    .where(and(eq(benchmarkRun.id, id), eq(benchmarkRun.userId, userId)))
    .limit(1)
    .get();
}

export function getLatestBenchmark(userId: string) {
  return db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, userId))
    .orderBy(desc(benchmarkRun.createdAt))
    .limit(1)
    .get();
}

function startBenchmark(
  benchmarkRunId: string,
  executeBenchmark: (benchmarkRunId: string) => Promise<void>,
) {
  if (activeExecutions.has(benchmarkRunId)) return;
  activeExecutions.add(benchmarkRunId);

  queueMicrotask(() => {
    void executeBenchmark(benchmarkRunId).finally(() => activeExecutions.delete(benchmarkRunId));
  });
}

export function getHistory(userId: string) {
  const comparisons = db
    .select()
    .from(comparisonRun)
    .where(eq(comparisonRun.userId, userId))
    .orderBy(desc(comparisonRun.createdAt))
    .all();
  const providerRuns = db.select().from(providerRun).all();
  const benchmarks = db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, userId))
    .orderBy(desc(benchmarkRun.createdAt))
    .all();

  const comparisonSummaries = comparisons.map((comparison) => {
    const runs = providerRuns.filter((run) => run.comparisonRunId === comparison.id);

    return {
      id: comparison.id,
      type: "comparison" as const,
      status: runs.every((run) => run.status === "succeeded")
        ? ("succeeded" as const)
        : ("failed" as const),
      createdAt: comparison.createdAt,
      filename: comparison.filename,
      providerCount: runs.length,
    };
  });
  const benchmarkSummaries = benchmarks.map((run) => ({
    id: run.id,
    type: "benchmark" as const,
    status: run.status,
    createdAt: run.createdAt,
    sampleCount: run.resultJson.sampleCount,
    manifestVersion: run.resultJson.manifestVersion,
  }));

  return [...comparisonSummaries, ...benchmarkSummaries].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

export function createBenchmarkRoutes(
  executeBenchmark: (benchmarkRunId: string) => Promise<void> = runBenchmark,
) {
  return new Elysia()
    .use(authPlugin)
    .post(
      "/benchmarks",
      async ({ body, user }) => {
        const benchmark = createOrGetActiveBenchmark(
          user.id,
          body.sampleCount ?? DEFAULT_SAMPLE_COUNT,
        );
        startBenchmark(benchmark.benchmarkRunId, executeBenchmark);
        return benchmark;
      },
      {
        auth: true,
        body: t.Object({
          sampleCount: t.Optional(
            t.Integer({ minimum: 1, maximum: 10, default: DEFAULT_SAMPLE_COUNT }),
          ),
        }),
        detail: {
          summary: "Start or reconnect to a benchmark",
          tags: ["Benchmarks"],
        },
      },
    )
    .get(
      "/benchmarks/latest",
      ({ user, status }) => {
        const run = getLatestBenchmark(user.id);
        if (!run) {
          return status(404, { type: "benchmark_not_found", message: "Benchmark not found" });
        }
        if (run.status === "running") startBenchmark(run.id, executeBenchmark);
        return run;
      },
      { auth: true },
    )
    .get(
      "/benchmarks/:id",
      ({ params: { id }, user, status }) => {
        const run = getBenchmark(user.id, id);
        if (!run) {
          return status(404, { type: "benchmark_not_found", message: "Benchmark not found" });
        }
        if (run.status === "running") startBenchmark(run.id, executeBenchmark);
        return run;
      },
      {
        auth: true,
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        detail: {
          summary: "Get benchmark progress and results",
          tags: ["Benchmarks"],
        },
      },
    )
    .get("/history", ({ user }) => getHistory(user.id), { auth: true });
}

export const benchmarkRoutes = createBenchmarkRoutes();

import { benchmarkManifest } from "@valsea/benchmark";
import { db, desc, eq } from "@valsea/db";
import {
  benchmarkRun,
  comparisonRun,
  providerRun,
  type BenchmarkResultJson,
} from "@valsea/db/schema/index";
import { Elysia, t } from "elysia";

const DEFAULT_SAMPLE_COUNT = 5;

export function createOrGetActiveBenchmark(sampleCount = DEFAULT_SAMPLE_COUNT) {
  const [activeRun] = db
    .select({ id: benchmarkRun.id })
    .from(benchmarkRun)
    .where(eq(benchmarkRun.status, "running"))
    .orderBy(desc(benchmarkRun.createdAt))
    .limit(1)
    .all();

  if (activeRun) {
    return { benchmarkRunId: activeRun.id };
  }

  const id = crypto.randomUUID();
  const selectedSampleIds = benchmarkManifest.samples
    .slice(0, sampleCount)
    .map(({ row_index }) => `part4-${row_index.toString().padStart(4, "0")}`);
  const resultJson: BenchmarkResultJson = {
    manifestVersion: benchmarkManifest.version,
    selectedSampleIds,
    sampleCount,
    providerResults: [],
    failures: [],
    requestProgress: {
      completed: 0,
      total: sampleCount * 3,
    },
  };

  db.insert(benchmarkRun).values({ id, status: "running", resultJson }).run();

  return { benchmarkRunId: id };
}

export function getBenchmark(id: string) {
  return db.select().from(benchmarkRun).where(eq(benchmarkRun.id, id)).limit(1).get();
}

export function getHistory() {
  const comparisons = db.select().from(comparisonRun).orderBy(desc(comparisonRun.createdAt)).all();
  const providerRuns = db.select().from(providerRun).all();
  const benchmarks = db.select().from(benchmarkRun).orderBy(desc(benchmarkRun.createdAt)).all();

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

export const benchmarkRoutes = new Elysia()
  .post(
    "/benchmarks",
    ({ body }) => createOrGetActiveBenchmark(body.sampleCount ?? DEFAULT_SAMPLE_COUNT),
    {
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
    "/benchmarks/:id",
    ({ params: { id }, status }) => {
      const run = getBenchmark(id);

      if (!run) {
        return status(404, {
          type: "benchmark_not_found",
          message: "Benchmark not found",
        });
      }

      return run;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Get benchmark progress and results",
        tags: ["Benchmarks"],
      },
    },
  )
  .get("/history", () => getHistory(), {
    detail: {
      summary: "List comparison and benchmark history",
      tags: ["History"],
    },
  });

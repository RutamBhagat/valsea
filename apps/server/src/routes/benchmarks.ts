import { benchmarkManifest } from "@valsea/benchmark";
import { db, desc, eq } from "@valsea/db";
import {
  benchmarkRun,
  comparisonRun,
  providerRun,
  type BenchmarkResultJson,
} from "@valsea/db/schema/index";
import { Elysia, t } from "elysia";
import { resolve } from "node:path";

const DEFAULT_SAMPLE_COUNT = 5;
const DEFAULT_RESULT_PATH = resolve(process.cwd(), "../qwen-modal/benchmark_result.json");

export type CommittedBenchmarkResult = {
  manifest_version: number;
  dataset: string;
  config: string;
  split: string;
  sample_count: number;
  selected_sample_ids: string[];
  metric: string;
  provider_conditions: Record<string, string>;
  summary: Array<{
    provider: string;
    mixed_error_rate: number | null;
    p50_latency_ms: number | null;
    p95_latency_ms: number | null;
    succeeded: number;
    failed: number;
  }>;
  samples: Array<{
    provider: string;
    sample_id: string;
    reference: string;
    prediction: string | null;
    latency_ms: number;
    error_rate: number | null;
    error: string | null;
  }>;
};

function isCommittedBenchmarkResult(value: unknown): value is CommittedBenchmarkResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<CommittedBenchmarkResult>;
  return (
    Number.isInteger(result.manifest_version) &&
    Number.isInteger(result.sample_count) &&
    Array.isArray(result.selected_sample_ids) &&
    typeof result.metric === "string" &&
    !!result.provider_conditions &&
    typeof result.provider_conditions === "object" &&
    Array.isArray(result.summary) &&
    Array.isArray(result.samples)
  );
}

export async function loadCommittedBenchmarkResult(
  resultPath = process.env.BENCHMARK_RESULT_PATH ?? DEFAULT_RESULT_PATH,
): Promise<CommittedBenchmarkResult> {
  const file = Bun.file(resultPath);
  if (!(await file.exists())) {
    throw new Error("Committed benchmark result is not available");
  }

  const result: unknown = await file.json();
  if (!isCommittedBenchmarkResult(result)) {
    throw new Error("Committed benchmark result has an invalid format");
  }

  return result;
}

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

export function createBenchmarkRoutes(
  loadResult: () => Promise<CommittedBenchmarkResult> = loadCommittedBenchmarkResult,
) {
  return new Elysia()
    .get(
      "/benchmark",
      async ({ status }) => {
        try {
          return await loadResult();
        } catch {
          return status(503, {
            type: "benchmark_result_unavailable",
            message: "Committed benchmark result is not available",
          });
        }
      },
      {
        detail: {
          summary: "Get the committed benchmark result",
          tags: ["Benchmarks"],
        },
      },
    )
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
}

export const benchmarkRoutes = createBenchmarkRoutes();

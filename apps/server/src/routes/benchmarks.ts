import { and, db, desc, eq } from "@valsea/db";
import { benchmarkRun, type BenchmarkResultJson } from "@valsea/db/schema/index";
import { Elysia, t } from "elysia";

import { authPlugin } from "../plugins/auth";
import { runBenchmark } from "../services/benchmark-runner";

const activeExecutions = new Set<string>();

function startBenchmark(benchmarkRunId: string) {
  if (activeExecutions.has(benchmarkRunId)) return;
  activeExecutions.add(benchmarkRunId);

  queueMicrotask(() => {
    void runBenchmark(benchmarkRunId).finally(() => activeExecutions.delete(benchmarkRunId));
  });
}

export const benchmarkRoutes = new Elysia()
  .use(authPlugin)
  .post(
    "/benchmarks",
    ({ body, user }) => {
      const activeRun = db
        .select({ id: benchmarkRun.id })
        .from(benchmarkRun)
        .where(and(eq(benchmarkRun.userId, user.id), eq(benchmarkRun.status, "running")))
        .orderBy(desc(benchmarkRun.createdAt))
        .limit(1)
        .get();

      if (activeRun) {
        startBenchmark(activeRun.id);
        return { benchmarkRunId: activeRun.id };
      }

      const id = crypto.randomUUID();
      const resultJson: BenchmarkResultJson = {
        selectedSampleIds: [],
        sampleCount: body.sampleCount,
        providerResults: [],
        summary: [],
        failures: [],
        requestProgress: { completed: 0, total: body.sampleCount * 3 },
      };

      db.insert(benchmarkRun).values({ id, userId: user.id, status: "running", resultJson }).run();
      startBenchmark(id);

      return { benchmarkRunId: id };
    },
    {
      auth: true,
      body: t.Object({
        sampleCount: t.Integer({ minimum: 1, maximum: 10 }),
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
      const run = db
        .select()
        .from(benchmarkRun)
        .where(eq(benchmarkRun.userId, user.id))
        .orderBy(desc(benchmarkRun.createdAt))
        .limit(1)
        .get();

      if (!run) {
        return status(404, {
          type: "benchmark_not_found",
          message: "Benchmark not found",
        });
      }
      if (run.status === "running") startBenchmark(run.id);
      return run;
    },
    { auth: true },
  )
  .get(
    "/benchmarks/:id",
    ({ params: { id }, user, status }) => {
      const run = db
        .select()
        .from(benchmarkRun)
        .where(and(eq(benchmarkRun.id, id), eq(benchmarkRun.userId, user.id)))
        .limit(1)
        .get();

      if (!run) {
        return status(404, {
          type: "benchmark_not_found",
          message: "Benchmark not found",
        });
      }
      if (run.status === "running") startBenchmark(run.id);
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
  );

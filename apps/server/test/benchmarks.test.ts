import { afterAll, beforeEach, expect, test } from "bun:test";
import { db } from "@valsea/db";
import { benchmarkRun, comparisonRun, providerRun } from "@valsea/db/schema/index";

import {
  createBenchmarkRoutes,
  createOrGetActiveBenchmark,
  getBenchmark,
  getHistory,
} from "../src/routes/benchmarks";

function clearRuns() {
  db.delete(providerRun).run();
  db.delete(comparisonRun).run();
  db.delete(benchmarkRun).run();
}

beforeEach(clearRuns);
afterAll(clearRuns);

test("read-only benchmark route returns the committed result", async () => {
  const committedResult = {
    manifest_version: 1,
    dataset: "MERaLiON/Multitask-National-Speech-Corpus-v1",
    config: "ASR-PART4-Test",
    split: "train",
    sample_count: 5,
    selected_sample_ids: ["part4-0001"],
    metric: "MER (Mandarin characters + English words)",
    provider_conditions: { valsea: "language=english" },
    summary: [],
    samples: [],
  };
  const routes = createBenchmarkRoutes(async () => committedResult);

  const response = await routes.handle(new Request("http://localhost/benchmark"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(committedResult);
});

test("read-only benchmark route reports an unavailable committed result", async () => {
  const routes = createBenchmarkRoutes(async () => {
    throw new Error("missing");
  });

  const response = await routes.handle(new Request("http://localhost/benchmark"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    type: "benchmark_result_unavailable",
    message: "Committed benchmark result is not available",
  });
});

test.serial("benchmark creation uses manifest order and returns the active run", () => {
  const created = createOrGetActiveBenchmark(2);
  const active = createOrGetActiveBenchmark(10);
  const saved = getBenchmark(created.benchmarkRunId);

  expect(active).toEqual(created);
  expect(saved?.status).toBe("running");
  expect(saved?.resultJson).toMatchObject({
    manifestVersion: 1,
    selectedSampleIds: ["part4-0001", "part4-0003"],
    sampleCount: 2,
    requestProgress: { completed: 0, total: 6 },
  });
  expect(db.select().from(benchmarkRun).all()).toHaveLength(1);
});

test.serial("benchmark routes validate sample count and return saved progress", async () => {
  const routes = createBenchmarkRoutes(undefined, async () => {});
  const invalidResponse = await routes.handle(
    new Request("http://localhost/benchmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sampleCount: 11 }),
    }),
  );
  expect(invalidResponse.status).toBe(422);

  const createResponse = await routes.handle(
    new Request("http://localhost/benchmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(createResponse.status).toBe(200);
  const created = (await createResponse.json()) as { benchmarkRunId: string };

  const getResponse = await routes.handle(
    new Request(`http://localhost/benchmarks/${created.benchmarkRunId}`),
  );
  const saved = (await getResponse.json()) as {
    resultJson: { sampleCount: number; requestProgress: { total: number } };
  };

  expect(getResponse.status).toBe(200);
  expect(saved.resultJson.sampleCount).toBe(5);
  expect(saved.resultJson.requestProgress.total).toBe(15);
});

test.serial("history includes comparison and benchmark summaries", () => {
  db.insert(comparisonRun)
    .values({
      id: crypto.randomUUID(),
      filename: "sample.wav",
      contentType: "audio/wav",
      sizeBytes: 3,
    })
    .run();
  createOrGetActiveBenchmark(3);

  expect(getHistory()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "comparison", filename: "sample.wav" }),
      expect.objectContaining({
        type: "benchmark",
        sampleCount: 3,
        manifestVersion: 1,
      }),
    ]),
  );
});

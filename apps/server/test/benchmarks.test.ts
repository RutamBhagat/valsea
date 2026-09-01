import { afterAll, beforeEach, expect, test } from "bun:test";
import { db } from "@valsea/db";
import { benchmarkRun, comparisonRun, providerRun, user } from "@valsea/db/schema/index";

import { createOrGetActiveBenchmark, getBenchmark, getHistory } from "../src/routes/benchmarks";

const USER_ID = "benchmark-user";
const OTHER_USER_ID = "other-benchmark-user";

function clearRuns() {
  db.delete(providerRun).run();
  db.delete(comparisonRun).run();
  db.delete(benchmarkRun).run();
  db.delete(user).run();
}

function insertUser(id: string) {
  db.insert(user)
    .values({ id, name: id, email: `${id}@example.com` })
    .run();
}

beforeEach(() => {
  clearRuns();
  insertUser(USER_ID);
  insertUser(OTHER_USER_ID);
});
afterAll(clearRuns);

test.serial("benchmark creation uses manifest order and returns the user's active run", () => {
  const created = createOrGetActiveBenchmark(USER_ID, 2);
  const active = createOrGetActiveBenchmark(USER_ID, 10);
  const otherUserRun = createOrGetActiveBenchmark(OTHER_USER_ID, 3);
  const saved = getBenchmark(USER_ID, created.benchmarkRunId);

  expect(active).toEqual(created);
  expect(otherUserRun).not.toEqual(created);
  expect(getBenchmark(OTHER_USER_ID, created.benchmarkRunId)).toBeUndefined();
  expect(saved?.status).toBe("running");
  expect(saved?.resultJson).toMatchObject({
    manifestVersion: 1,
    selectedSampleIds: ["part4-0001", "part4-0003"],
    sampleCount: 2,
    requestProgress: { completed: 0, total: 6 },
  });
});

test.serial("history only includes the user's comparison and benchmark runs", () => {
  db.insert(comparisonRun)
    .values({
      id: crypto.randomUUID(),
      userId: USER_ID,
      filename: "sample.wav",
      contentType: "audio/wav",
      sizeBytes: 3,
    })
    .run();
  db.insert(comparisonRun)
    .values({
      id: crypto.randomUUID(),
      userId: OTHER_USER_ID,
      filename: "private.wav",
      contentType: "audio/wav",
      sizeBytes: 3,
    })
    .run();
  createOrGetActiveBenchmark(USER_ID, 3);
  createOrGetActiveBenchmark(OTHER_USER_ID, 4);

  const history = getHistory(USER_ID);
  expect(history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "comparison", filename: "sample.wav" }),
      expect.objectContaining({ type: "benchmark", sampleCount: 3, manifestVersion: 1 }),
    ]),
  );
  expect(history).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ filename: "private.wav" }),
      expect.objectContaining({ sampleCount: 4 }),
    ]),
  );
});

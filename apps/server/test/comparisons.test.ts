import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { db, eq } from "@valsea/db";
import { comparisonRun, providerRun, user } from "@valsea/db/schema/index";

import type { ProviderId, TranscriptionProvider } from "../src/providers/types";
import { createComparison } from "../src/routes/comparisons";

const USER_ID = "comparison-user";

function clearComparisons() {
  db.delete(providerRun).run();
  db.delete(comparisonRun).run();
}

beforeEach(() => {
  clearComparisons();
  db.insert(user)
    .values({ id: USER_ID, name: USER_ID, email: `${USER_ID}@example.com` })
    .onConflictDoNothing()
    .run();
});
afterAll(clearComparisons);

afterEach(() => {
  mock.restore();
});

function providerRegistry(overrides: Partial<Record<ProviderId, TranscriptionProvider>> = {}) {
  const success = (provider: ProviderId): TranscriptionProvider => ({
    transcribe: mock(async () => ({ text: `${provider} transcript` })),
  });

  return {
    valsea: overrides.valsea ?? success("valsea"),
    qwen: overrides.qwen ?? success("qwen"),
    gemini: overrides.gemini ?? success("gemini"),
  } satisfies Record<ProviderId, TranscriptionProvider>;
}

function sampleAudio() {
  return new File([new Uint8Array([1, 2, 3])], "sample.wav", {
    type: "audio/wav",
  });
}

async function waitForProviderRuns(comparisonRunId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = db
      .select()
      .from(providerRun)
      .where(eq(providerRun.comparisonRunId, comparisonRunId))
      .all();
    if (rows.length > 0 && rows.every((row) => row.status !== "pending")) return rows;
    await Bun.sleep(5);
  }

  throw new Error("Provider runs did not finish");
}

test.serial("selected providers run and persist their final results", async () => {
  const registry = providerRegistry();
  const audio = sampleAudio();

  const { comparisonRunId } = await createComparison({
    userId: USER_ID,
    uploadedAudio: audio,
    selectedProviders: ["valsea", "gemini"],
    dependencies: { providers: registry },
  });

  await waitForProviderRuns(comparisonRunId);
  const rows = db
    .select({
      provider: providerRun.provider,
      status: providerRun.status,
      transcript: providerRun.transcript,
    })
    .from(providerRun)
    .where(eq(providerRun.comparisonRunId, comparisonRunId))
    .all()
    .sort((left, right) => left.provider.localeCompare(right.provider));

  expect(registry.valsea.transcribe).toHaveBeenCalledWith({ audio });
  expect(registry.qwen.transcribe).not.toHaveBeenCalled();
  expect(registry.gemini.transcribe).toHaveBeenCalledWith({ audio });
  expect(rows).toEqual([
    { provider: "gemini", status: "succeeded", transcript: "gemini transcript" },
    { provider: "valsea", status: "succeeded", transcript: "valsea transcript" },
  ]);
});

test.serial("selected providers start concurrently", async () => {
  const valseaResult = Promise.withResolvers<{ text: string }>();
  const geminiResult = Promise.withResolvers<{ text: string }>();
  const valseaTranscribe = mock(() => valseaResult.promise);
  const geminiTranscribe = mock(() => geminiResult.promise);
  const registry = providerRegistry({
    valsea: { transcribe: valseaTranscribe },
    gemini: { transcribe: geminiTranscribe },
  });

  const { comparisonRunId } = await createComparison({
    userId: USER_ID,
    uploadedAudio: sampleAudio(),
    selectedProviders: ["valsea", "gemini"],
    dependencies: { providers: registry },
  });

  expect(valseaTranscribe).toHaveBeenCalledTimes(1);
  expect(geminiTranscribe).toHaveBeenCalledTimes(1);
  expect(
    db
      .select({ status: providerRun.status })
      .from(providerRun)
      .where(eq(providerRun.comparisonRunId, comparisonRunId))
      .all(),
  ).toEqual([{ status: "pending" }, { status: "pending" }]);

  valseaResult.resolve({ text: "valsea result" });
  geminiResult.resolve({ text: "gemini result" });
  await waitForProviderRuns(comparisonRunId);
});

test.serial("one provider failure leaves another provider result intact", async () => {
  const registry = providerRegistry({
    valsea: {
      transcribe: mock(async () => {
        throw new Error("provider unavailable");
      }),
    },
    gemini: {
      transcribe: mock(async () => ({ text: "gemini survived" })),
    },
  });

  const { comparisonRunId } = await createComparison({
    userId: USER_ID,
    uploadedAudio: sampleAudio(),
    selectedProviders: ["valsea", "gemini"],
    dependencies: { providers: registry },
  });

  await waitForProviderRuns(comparisonRunId);
  const rows = db
    .select({
      provider: providerRun.provider,
      status: providerRun.status,
      transcript: providerRun.transcript,
      error: providerRun.error,
    })
    .from(providerRun)
    .where(eq(providerRun.comparisonRunId, comparisonRunId))
    .all()
    .sort((left, right) => left.provider.localeCompare(right.provider));

  expect(rows).toEqual([
    {
      provider: "gemini",
      status: "succeeded",
      transcript: "gemini survived",
      error: null,
    },
    {
      provider: "valsea",
      status: "failed",
      transcript: null,
      error: "Transcription failed",
    },
  ]);
});

import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { db, eq, migrateDatabase } from "@valsea/db";
import { comparisonRun, providerRun } from "@valsea/db/schema/index";

import type { ProviderId, TranscriptionProvider } from "../src/providers/types";
import { createComparison } from "../src/routes/comparisons";

beforeAll(() => {
  migrateDatabase();
});

function clearComparisons() {
  db.delete(providerRun).run();
  db.delete(comparisonRun).run();
}

beforeEach(clearComparisons);
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

test.serial("selected providers run and persist their final results", async () => {
  const registry = providerRegistry();

  const { comparisonRunId } = await createComparison(sampleAudio(), ["valsea", "gemini"], {
    providers: registry,
  });

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

  expect(registry.valsea.transcribe).toHaveBeenCalledTimes(1);
  expect(registry.qwen.transcribe).not.toHaveBeenCalled();
  expect(registry.gemini.transcribe).toHaveBeenCalledTimes(1);
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

  const comparison = createComparison(sampleAudio(), ["valsea", "gemini"], {
    providers: registry,
  });
  await Bun.sleep(0);

  expect(valseaTranscribe).toHaveBeenCalledTimes(1);
  expect(geminiTranscribe).toHaveBeenCalledTimes(1);

  valseaResult.resolve({ text: "valsea result" });
  geminiResult.resolve({ text: "gemini result" });
  await comparison;
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

  const { comparisonRunId } = await createComparison(sampleAudio(), ["valsea", "gemini"], {
    providers: registry,
  });

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

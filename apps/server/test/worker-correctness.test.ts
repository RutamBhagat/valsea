import { afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db, eq, migrateDatabase } from "@valsea/db";
import { audio, comparisonRun, providerRun } from "@valsea/db/schema/index";
import { env } from "@valsea/env/server";

import { uploadAudio } from "../src/lib/r2";
import type { ProviderId, TranscriptionProvider } from "../src/providers/types";
import { createComparison } from "../src/routes/comparisons";
import { processNextRun, recoverInterruptedRuns } from "../src/worker";

beforeAll(() => {
  migrateDatabase();
});

beforeEach(() => {
  db.delete(providerRun).run();
  db.delete(comparisonRun).run();
  db.delete(audio).run();
});

afterEach(() => {
  mock.restore();
});

function seedComparison(
  runs: Array<{ provider: ProviderId; status?: "queued" | "running" | "succeeded" }>,
) {
  const audioId = crypto.randomUUID();
  const comparisonRunId = crypto.randomUUID();

  db.insert(audio)
    .values({
      id: audioId,
      objectKey: `audio/${audioId}`,
      filename: "sample.wav",
      contentType: "audio/wav",
      sizeBytes: 3,
    })
    .run();
  db.insert(comparisonRun).values({ id: comparisonRunId, audioId }).run();

  const providerRunIds = runs.map(({ provider, status = "queued" }) => {
    const id = crypto.randomUUID();
    db.insert(providerRun)
      .values({
        id,
        comparisonRunId,
        provider,
        status,
        startedAt: status === "running" ? new Date() : null,
        completedAt: status === "succeeded" ? new Date() : null,
        transcript: status === "succeeded" ? `${provider} transcript` : null,
      })
      .run();
    return id;
  });

  return { comparisonRunId, providerRunIds };
}

function providerRegistry(overrides: Partial<Record<ProviderId, TranscriptionProvider>> = {}) {
  const success = (provider: ProviderId): TranscriptionProvider => ({
    transcribe: mock(async () => ({ text: `${provider} transcript` })),
  });

  return {
    valsea: overrides.valsea ?? success("valsea"),
    qwen: overrides.qwen ?? success("qwen"),
    whisper: overrides.whisper ?? success("whisper"),
  } satisfies Record<ProviderId, TranscriptionProvider>;
}

test.serial("selected providers create exactly the corresponding queued runs", async () => {
  const storeAudio = mock(async () => {});
  const uploadedAudio = new File([new Uint8Array([1, 2, 3])], "sample.wav", {
    type: "audio/wav",
  });

  const { comparisonRunId } = await createComparison(
    uploadedAudio,
    ["valsea", "whisper"],
    storeAudio,
  );

  const rows = db
    .select({ provider: providerRun.provider, status: providerRun.status })
    .from(providerRun)
    .where(eq(providerRun.comparisonRunId, comparisonRunId))
    .all()
    .sort((left, right) => left.provider.localeCompare(right.provider));

  expect(storeAudio).toHaveBeenCalledTimes(1);
  expect(rows).toEqual([
    { provider: "valsea", status: "queued" },
    { provider: "whisper", status: "queued" },
  ]);
});

test.serial("R2 upload adapter sends a PutObject command with the audio metadata", async () => {
  const send = spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
  const bytes = new Uint8Array([1, 2, 3]);

  await uploadAudio("audio/test-object", bytes, "audio/wav");

  expect(send).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[0]?.[0];
  expect(command).toBeInstanceOf(PutObjectCommand);
  expect((command as PutObjectCommand).input).toMatchObject({
    Bucket: env.R2_AUDIO_BUCKET,
    Key: "audio/test-object",
    Body: bytes,
    ContentType: "audio/wav",
  });
});

test.serial("queued work dispatches to the provider recorded on the run", async () => {
  seedComparison([{ provider: "qwen" }]);
  const qwenTranscribe = mock(async () => ({ text: "qwen result" }));
  const registry = providerRegistry({ qwen: { transcribe: qwenTranscribe } });

  expect(
    await processNextRun({
      downloadAudio: mock(async () => new Uint8Array([1, 2, 3])),
      providers: registry,
    }),
  ).toBe(true);

  expect(qwenTranscribe).toHaveBeenCalledTimes(1);
  expect(registry.valsea.transcribe).not.toHaveBeenCalled();
  expect(registry.whisper.transcribe).not.toHaveBeenCalled();
});

test.serial("a completed run is not intentionally executed again", async () => {
  seedComparison([{ provider: "valsea" }]);
  const transcribe = mock(async () => ({ text: "done" }));
  const registry = providerRegistry({ valsea: { transcribe } });
  const downloadAudio = mock(async () => new Uint8Array([1, 2, 3]));

  expect(await processNextRun({ downloadAudio, providers: registry })).toBe(true);
  expect(await processNextRun({ downloadAudio, providers: registry })).toBe(false);
  expect(transcribe).toHaveBeenCalledTimes(1);
});

test.serial("one provider failure leaves another provider result intact", async () => {
  const { comparisonRunId } = seedComparison([{ provider: "valsea" }, { provider: "whisper" }]);
  const registry = providerRegistry({
    valsea: {
      transcribe: mock(async () => {
        throw new Error("provider unavailable");
      }),
    },
    whisper: {
      transcribe: mock(async () => ({ text: "whisper survived" })),
    },
  });
  const downloadAudio = mock(async () => new Uint8Array([1, 2, 3]));

  expect(await processNextRun({ downloadAudio, providers: registry })).toBe(true);
  expect(await processNextRun({ downloadAudio, providers: registry })).toBe(true);

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
      provider: "valsea",
      status: "failed",
      transcript: null,
      error: "Transcription failed",
    },
    {
      provider: "whisper",
      status: "succeeded",
      transcript: "whisper survived",
      error: null,
    },
  ]);
});

test.serial("startup recovery requeues interrupted running work only", () => {
  const { providerRunIds } = seedComparison([
    { provider: "qwen", status: "running" },
    { provider: "whisper", status: "succeeded" },
  ]);

  recoverInterruptedRuns();

  const recovered = db
    .select({ status: providerRun.status, startedAt: providerRun.startedAt })
    .from(providerRun)
    .where(eq(providerRun.id, providerRunIds[0]!))
    .get();
  const completed = db
    .select({ status: providerRun.status, transcript: providerRun.transcript })
    .from(providerRun)
    .where(eq(providerRun.id, providerRunIds[1]!))
    .get();

  expect(recovered).toEqual({ status: "queued", startedAt: null });
  expect(completed).toEqual({ status: "succeeded", transcript: "whisper transcript" });
});

import { and, db, eq } from "@valsea/db";
import { audio, comparisonRun, providerRun } from "@valsea/db/schema/index";
import { Elysia } from "elysia";

import { downloadAudio } from "./lib/r2";
import { providers } from "./providers";

const idlePollMs = 1_000;

function claimNextRun() {
  return db.transaction((tx) => {
    const next = tx
      .select({ id: providerRun.id })
      .from(providerRun)
      .where(eq(providerRun.status, "queued"))
      .limit(1)
      .get();

    if (!next) return null;

    return (
      tx
        .update(providerRun)
        .set({ status: "running", startedAt: new Date(), error: null })
        .where(and(eq(providerRun.id, next.id), eq(providerRun.status, "queued")))
        .returning({ id: providerRun.id })
        .get()?.id ?? null
    );
  });
}

async function processNextRun() {
  const providerRunId = claimNextRun();
  if (!providerRunId) return false;

  const run = db
    .select({
      comparisonRunId: providerRun.comparisonRunId,
      provider: providerRun.provider,
      objectKey: audio.objectKey,
      filename: audio.filename,
      contentType: audio.contentType,
    })
    .from(providerRun)
    .innerJoin(comparisonRun, eq(providerRun.comparisonRunId, comparisonRun.id))
    .innerJoin(audio, eq(comparisonRun.audioId, audio.id))
    .where(eq(providerRun.id, providerRunId))
    .get();

  let latencyMs: number | null = null;
  let providerStartedAt: number | null = null;

  try {
    if (!run) throw new Error(`Provider run ${providerRunId} has no audio`);

    const audioBytes = await downloadAudio(run.objectKey);
    providerStartedAt = performance.now();
    const result = await providers[run.provider].transcribe({
      audio: audioBytes,
      filename: run.filename,
      contentType: run.contentType,
    });
    latencyMs = Math.round(performance.now() - providerStartedAt);

    db.update(providerRun)
      .set({
        status: "succeeded",
        transcript: result.text,
        latencyMs,
        error: null,
        completedAt: new Date(),
      })
      .where(eq(providerRun.id, providerRunId))
      .run();

    console.info(
      JSON.stringify({
        comparisonRunId: run.comparisonRunId,
        providerRunId,
        provider: run.provider,
        status: "succeeded",
        latencyMs,
      }),
    );
  } catch {
    if (providerStartedAt !== null) {
      latencyMs = Math.round(performance.now() - providerStartedAt);
    }

    db.update(providerRun)
      .set({
        status: "failed",
        latencyMs,
        error: "Transcription failed",
        completedAt: new Date(),
      })
      .where(eq(providerRun.id, providerRunId))
      .run();

    if (run) {
      console.error(
        JSON.stringify({
          comparisonRunId: run.comparisonRunId,
          providerRunId,
          provider: run.provider,
          status: "failed",
          latencyMs,
        }),
      );
    } else {
      console.error(`Transcription ${providerRunId} failed`);
    }
  }

  return true;
}

let stopped = true;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

async function poll() {
  let delay = idlePollMs;

  try {
    if (await processNextRun()) delay = 0;
  } catch (error) {
    console.error("Transcription worker poll failed", error);
  }

  if (!stopped) pollTimer = setTimeout(poll, delay);
}

export const transcriptionWorker = new Elysia({ name: "transcription-worker" })
  .onStart(() => {
    stopped = false;
    db.update(providerRun)
      .set({ status: "queued", startedAt: null })
      .where(eq(providerRun.status, "running"))
      .run();
    pollTimer = setTimeout(poll, 0);
  })
  .onStop(() => {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
  });

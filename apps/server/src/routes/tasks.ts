import { and, db, eq } from "@valsea/db";
import { audio, comparisonRun, providerRun } from "@valsea/db/schema/index";
import { env } from "@valsea/env/server";
import { Elysia, t } from "elysia";

import { storage } from "../lib/gcp";
import { valsea } from "../providers/valsea";

export const taskRoutes = new Elysia({ prefix: "/internal/tasks" }).post(
  "/transcribe",
  async ({ body: { providerRunId }, status }) => {
    const [run] = await db
      .select({
        id: providerRun.id,
        provider: providerRun.provider,
        objectKey: audio.objectKey,
        filename: audio.filename,
        contentType: audio.contentType,
      })
      .from(providerRun)
      .innerJoin(comparisonRun, eq(providerRun.comparisonRunId, comparisonRun.id))
      .innerJoin(audio, eq(comparisonRun.audioId, audio.id))
      .where(eq(providerRun.id, providerRunId))
      .limit(1);

    if (!run) {
      return status(404, { error: "Provider run not found" });
    }

    const [claimed] = await db
      .update(providerRun)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(providerRun.id, providerRunId), eq(providerRun.status, "queued")))
      .returning({ id: providerRun.id });

    if (!claimed) {
      return status(409, { error: "Provider run is not queued" });
    }

    let latencyMs: number | null = null;

    try {
      const [audioBytes] = await storage
        .bucket(env.GCS_AUDIO_BUCKET)
        .file(run.objectKey)
        .download();

      if (run.provider !== "valsea") {
        throw new Error(`Unsupported provider for current worker slice: ${run.provider}`);
      }

      const startedAt = performance.now();
      const result = await valsea.transcribe({
        audio: audioBytes,
        filename: run.filename,
        contentType: run.contentType,
      });
      latencyMs = Math.round(performance.now() - startedAt);

      await db
        .update(providerRun)
        .set({
          status: "succeeded",
          transcript: result.text,
          latencyMs,
          error: null,
          completedAt: new Date(),
        })
        .where(eq(providerRun.id, providerRunId));

      return { status: "succeeded" as const };
    } catch {
      await db
        .update(providerRun)
        .set({
          status: "failed",
          latencyMs,
          error: "Transcription failed",
          completedAt: new Date(),
        })
        .where(eq(providerRun.id, providerRunId));

      return { status: "failed" as const };
    }
  },
  {
    body: t.Object({ providerRunId: t.String({ format: "uuid" }) }),
    detail: {
      summary: "Execute one queued transcription provider run",
      tags: ["Tasks"],
    },
  },
);

import { db, eq } from "@valsea/db";
import { audio, comparisonRun, providerRun } from "@valsea/db/schema/index";
import { env } from "@valsea/env/server";
import { Elysia, t } from "elysia";

import { storage } from "../lib/gcp";

const supportedAudioTypes = [
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/webm",
];

export const comparisonRoutes = new Elysia().post(
  "/comparisons",
  async ({ body: { audio: uploadedAudio } }) => {
    const audioId = crypto.randomUUID();
    const comparisonRunId = crypto.randomUUID();
    const providerRunId = crypto.randomUUID();
    const objectKey = `audio/${audioId}`;
    const bytes = Buffer.from(await uploadedAudio.arrayBuffer());

    await storage.bucket(env.GCS_AUDIO_BUCKET).file(objectKey).save(bytes, {
      contentType: uploadedAudio.type,
      resumable: false,
    });

    db.transaction((tx) => {
      tx.insert(audio)
        .values({
          id: audioId,
          objectKey,
          filename: uploadedAudio.name,
          contentType: uploadedAudio.type,
          sizeBytes: uploadedAudio.size,
        })
        .run();
      tx.insert(comparisonRun).values({ id: comparisonRunId, audioId }).run();
      tx.insert(providerRun)
        .values({
          id: providerRunId,
          comparisonRunId,
          provider: "valsea",
          status: "queued",
        })
        .run();
    });

    return { comparisonRunId };
  },
  {
    body: t.Object({ audio: t.File({ type: supportedAudioTypes }) }),
    detail: {
      summary: "Create a VALSEA transcription comparison",
      tags: ["Comparisons"],
    },
  },
).get(
  "/comparisons/:id",
  async ({ params: { id }, status }) => {
    const [comparison] = await db
      .select({
        id: comparisonRun.id,
        createdAt: comparisonRun.createdAt,
        audio: {
          id: audio.id,
          filename: audio.filename,
          contentType: audio.contentType,
          sizeBytes: audio.sizeBytes,
        },
      })
      .from(comparisonRun)
      .innerJoin(audio, eq(comparisonRun.audioId, audio.id))
      .where(eq(comparisonRun.id, id))
      .limit(1);

    if (!comparison) {
      return status(404, {
        type: "comparison_not_found",
        message: "Comparison not found",
      });
    }

    const providerRuns = await db
      .select({
        id: providerRun.id,
        provider: providerRun.provider,
        status: providerRun.status,
        transcript: providerRun.transcript,
        latencyMs: providerRun.latencyMs,
        error: providerRun.error,
        startedAt: providerRun.startedAt,
        completedAt: providerRun.completedAt,
      })
      .from(providerRun)
      .where(eq(providerRun.comparisonRunId, id));

    return { ...comparison, providerRuns };
  },
  {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
    detail: {
      summary: "Get a transcription comparison",
      tags: ["Comparisons"],
    },
  },
);

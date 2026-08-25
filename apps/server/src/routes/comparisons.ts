import { protos } from "@google-cloud/tasks";
import { db, eq } from "@valsea/db";
import { audio, comparisonRun, providerRun } from "@valsea/db/schema/index";
import { env } from "@valsea/env/server";
import { Elysia, t } from "elysia";

import { cloudTasks, storage } from "../lib/gcp";

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
    if (env.NODE_ENV === "production") {
      const requiredTaskTargetEnv = [
        "CLOUD_TASKS_QUEUE",
        "TASK_INVOKER_SERVICE_ACCOUNT_EMAIL",
        "WORKER_URL",
      ] as const;

      for (const key of requiredTaskTargetEnv) {
        if (!process.env[key]) {
          throw new Error(`${key} must be injected by Pulumi in production`);
        }
      }
    }

    const audioId = crypto.randomUUID();
    const comparisonRunId = crypto.randomUUID();
    const providerRunId = crypto.randomUUID();
    const objectKey = `audio/${audioId}`;
    const bytes = Buffer.from(await uploadedAudio.arrayBuffer());

    await storage.bucket(env.GCS_AUDIO_BUCKET).file(objectKey).save(bytes, {
      contentType: uploadedAudio.type,
      resumable: false,
    });

    await db.batch([
      db.insert(audio).values({
        id: audioId,
        objectKey,
        filename: uploadedAudio.name,
        contentType: uploadedAudio.type,
        sizeBytes: uploadedAudio.size,
      }),
      db.insert(comparisonRun).values({ id: comparisonRunId, audioId }),
      db.insert(providerRun).values({
        id: providerRunId,
        comparisonRunId,
        provider: "valsea",
        status: "queued",
      }),
    ]);

    const parent = cloudTasks.queuePath(env.GCP_PROJECT_ID, env.GCP_REGION, env.CLOUD_TASKS_QUEUE);
    const targetUrl = new URL("/internal/tasks/transcribe", env.WORKER_URL).toString();
    const payload = Buffer.from(JSON.stringify({ providerRunId })).toString("base64");

    await cloudTasks.createTask({
      parent,
      task: {
        name: `${parent}/tasks/provider-${providerRunId}`,
        httpRequest: {
          httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
          url: targetUrl,
          headers: { "Content-Type": "application/json" },
          body: payload,
          oidcToken: {
            serviceAccountEmail: env.TASK_INVOKER_SERVICE_ACCOUNT_EMAIL,
            audience: env.WORKER_URL,
          },
        },
      },
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

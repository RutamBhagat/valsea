import { protos } from "@google-cloud/tasks";
import { db } from "@valsea/db";
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
);

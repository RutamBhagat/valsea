import { Storage } from "@google-cloud/storage";
import { CloudTasksClient } from "@google-cloud/tasks";
import { credentials } from "@grpc/grpc-js";
import { env } from "@valsea/env/server";

const isLocal = env.NODE_ENV !== "production";
const flociEndpoint = new URL(env.FLOCI_GCP_ENDPOINT);

if (isLocal) {
  process.env.STORAGE_EMULATOR_HOST = flociEndpoint.origin;
}

export const storage = new Storage({ projectId: env.GCP_PROJECT_ID });
export const cloudTasks: CloudTasksClient = new CloudTasksClient(
  isLocal
    ? {
        apiEndpoint: flociEndpoint.hostname,
        port: Number(flociEndpoint.port || 4588),
        sslCreds: credentials.createInsecure(),
      }
    : undefined,
);

function isAlreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return code === 6 || code === 409;
}

export async function ensureLocalGcpResources() {
  if (!isLocal) return;

  try {
    await storage.createBucket(env.GCS_AUDIO_BUCKET, {
      location: env.GCP_REGION,
    });
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }

  const queueName = cloudTasks.queuePath(
    env.GCP_PROJECT_ID,
    env.GCP_REGION,
    env.CLOUD_TASKS_QUEUE,
  );

  try {
    await cloudTasks.createQueue({
      parent: cloudTasks.locationPath(env.GCP_PROJECT_ID, env.GCP_REGION),
      queue: { name: queueName },
    });
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
}

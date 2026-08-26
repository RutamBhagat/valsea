import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import * as v from "valibot";

const nonEmptyString = v.pipe(v.string(), v.minLength(1));

export const env = createEnv({
  server: {
    DATABASE_URL: nonEmptyString,
    DATABASE_URL_DIRECT: nonEmptyString,
    BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32)),
    BETTER_AUTH_URL: v.pipe(v.string(), v.url()),
    CORS_ORIGIN: v.pipe(v.string(), v.url()),
    GOOGLE_CLIENT_ID: nonEmptyString,
    GOOGLE_CLIENT_SECRET: nonEmptyString,
    VALSEA_API_KEY: nonEmptyString,
    GCP_PROJECT_ID: v.optional(nonEmptyString, "floci-local"),
    GCP_REGION: v.optional(nonEmptyString, "us-west1"),
    GCS_AUDIO_BUCKET: v.optional(nonEmptyString, "valsea-audio-local"),
    CLOUD_TASKS_QUEUE: v.optional(nonEmptyString, "valsea-transcriptions"),
    TASK_INVOKER_SERVICE_ACCOUNT_EMAIL: v.optional(
      nonEmptyString,
      "valsea-task-invoker@floci-local.iam.gserviceaccount.com",
    ),
    TASK_TARGET_URL: v.optional(v.pipe(v.string(), v.url()), "http://localhost:3000"),
    FLOCI_GCP_ENDPOINT: v.optional(v.pipe(v.string(), v.url()), "http://localhost:4588"),
    NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

const pulumiInjectedEnv = [
  "GCP_PROJECT_ID",
  "GCP_REGION",
  "GCS_AUDIO_BUCKET",
  "CLOUD_TASKS_QUEUE",
  "TASK_INVOKER_SERVICE_ACCOUNT_EMAIL",
  "TASK_TARGET_URL",
] as const;

if (env.NODE_ENV === "production") {
  for (const key of pulumiInjectedEnv) {
    if (!process.env[key]) {
      throw new Error(`${key} must be injected by Pulumi in production`);
    }
  }
}

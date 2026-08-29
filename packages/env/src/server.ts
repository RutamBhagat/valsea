import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import * as v from "valibot";

const nonEmptyString = v.pipe(v.string(), v.minLength(1));

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32)),
    BETTER_AUTH_URL: v.pipe(v.string(), v.url()),
    CORS_ORIGIN: v.pipe(v.string(), v.url()),
    GOOGLE_CLIENT_ID: nonEmptyString,
    GOOGLE_CLIENT_SECRET: nonEmptyString,
    VALSEA_API_KEY: nonEmptyString,
    GEMINI_API_KEY: nonEmptyString,
    QWEN_MODAL_URL: v.pipe(v.string(), v.url()),
    MODAL_PROXY_TOKEN_ID: nonEmptyString,
    MODAL_PROXY_TOKEN_SECRET: nonEmptyString,
    NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

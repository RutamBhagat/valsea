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
    CLOUDFLARE_ACCOUNT_ID: nonEmptyString,
    CLOUDFLARE_API_TOKEN: nonEmptyString,
    QWEN_MODAL_URL: v.pipe(v.string(), v.url()),
    MODAL_PROXY_TOKEN_ID: nonEmptyString,
    MODAL_PROXY_TOKEN_SECRET: nonEmptyString,
    R2_ACCOUNT_ID: nonEmptyString,
    R2_ACCESS_KEY_ID: nonEmptyString,
    R2_SECRET_ACCESS_KEY: nonEmptyString,
    R2_AUDIO_BUCKET: v.optional(nonEmptyString, "valsea-audio"),
    NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

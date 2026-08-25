import { createEnv } from "@t3-oss/env-core";
import * as v from "valibot";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SERVER_URL: v.pipe(v.string(), v.url()),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});

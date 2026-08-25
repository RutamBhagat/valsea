import { treaty } from "@elysia/eden";
import { env } from "@valsea/env/web";

import type { App } from "@valsea/server/app";

export const api = treaty<App>(env.VITE_SERVER_URL, {
  fetch: {
    credentials: "include",
  },
  throwHttpError: true,
});

import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { auth } from "@valsea/auth";
import { env } from "@valsea/env/server";
import { Elysia, t } from "elysia";

import { apiRoutes } from "./routes/api";

export const app = new Elysia()
  .use(
    openapi({
      path: "/openapi",
      specPath: "/openapi/json",
      documentation: {
        info: {
          title: "VALSEA Transcription API",
          version: "1.0.0",
        },
      },
      exclude: {
        methods: ["options"],
      },
    }),
  )
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  .all("/api/auth/*", async ({ request, status }) => {
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .use(apiRoutes)
  .get("/healthz", () => "OK" as const, {
    detail: {
      summary: "Check server health",
      tags: ["Health"],
    },
    response: t.Literal("OK"),
  })
  .get("/", () => "OK" as const, {
    detail: {
      summary: "Check server health",
      tags: ["Health"],
    },
    response: t.Literal("OK"),
  });

export type App = typeof app;

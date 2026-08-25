import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { auth } from "@valsea/auth";
import { env } from "@valsea/env/server";
import { Elysia, t } from "elysia";

new Elysia()
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
  .all("/api/auth/*", async (context) => {
    const { request, status } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .get("/", () => "OK" as const, {
    detail: {
      summary: "Check server health",
      tags: ["Health"],
    },
    response: t.Literal("OK"),
  })
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

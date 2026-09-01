import { and, db, eq } from "@valsea/db";
import { comparisonRun, providerRun } from "@valsea/db/schema/index";
import bytes from "bytes";
import { Elysia, t } from "elysia";
import { fileTypeFromBlob } from "file-type";

import { authPlugin } from "../plugins/auth";
import { providers as providerImplementations } from "../providers";

export const comparisonRoutes = new Elysia()
  .use(authPlugin)
  .post(
    "/comparisons",
    async ({ body, user, status }) => {
      const detectedType = await fileTypeFromBlob(body.audio);

      if (detectedType?.mime !== "audio/wav") {
        return status(422, {
          type: "unsupported_audio_type",
          message: "Only WAV audio is supported",
        });
      }

      const audio = new File([body.audio], body.audio.name, { type: "audio/wav" });
      const comparisonRunId = crypto.randomUUID();

      db.transaction((tx) => {
        tx.insert(comparisonRun)
          .values({
            id: comparisonRunId,
            userId: user.id,
            filename: audio.name,
            contentType: audio.type,
            sizeBytes: audio.size,
          })
          .run();
        tx.insert(providerRun)
          .values(
            body.providers.map((provider) => ({
              comparisonRunId,
              provider,
              status: "pending" as const,
            })),
          )
          .run();
      });

      queueMicrotask(() => {
        void Promise.allSettled(
          body.providers.map(async (provider) => {
            const startedAt = performance.now();

            try {
              const result = await providerImplementations[provider].transcribe({ audio });
              const latencyMs = Math.round(performance.now() - startedAt);

              db.update(providerRun)
                .set({
                  status: "succeeded",
                  transcript: result.text,
                  latencyMs,
                  error: null,
                })
                .where(
                  and(
                    eq(providerRun.comparisonRunId, comparisonRunId),
                    eq(providerRun.provider, provider),
                  ),
                )
                .run();

              console.info(
                JSON.stringify({ comparisonRunId, provider, status: "succeeded", latencyMs }),
              );
            } catch {
              const latencyMs = Math.round(performance.now() - startedAt);

              db.update(providerRun)
                .set({
                  status: "failed",
                  transcript: null,
                  latencyMs,
                  error: "Transcription failed",
                })
                .where(
                  and(
                    eq(providerRun.comparisonRunId, comparisonRunId),
                    eq(providerRun.provider, provider),
                  ),
                )
                .run();

              console.error(
                JSON.stringify({ comparisonRunId, provider, status: "failed", latencyMs }),
              );
            }
          }),
        );
      });

      return { comparisonRunId };
    },
    {
      auth: true,
      body: t.Object({
        audio: t.File({ maxSize: bytes.parse("10 MB")! }),
        providers: t.Array(t.UnionEnum(["valsea", "qwen", "gemini"]), {
          minItems: 2,
          uniqueItems: true,
        }),
      }),
      detail: {
        summary: "Create a VALSEA transcription comparison",
        tags: ["Comparisons"],
      },
    },
  )
  .get(
    "/comparisons/:id",
    ({ params: { id }, user, status }) => {
      const comparison = db
        .select()
        .from(comparisonRun)
        .where(and(eq(comparisonRun.id, id), eq(comparisonRun.userId, user.id)))
        .limit(1)
        .get();

      if (!comparison) {
        return status(404, {
          type: "comparison_not_found",
          message: "Comparison not found",
        });
      }

      const providerRuns = db
        .select({
          provider: providerRun.provider,
          status: providerRun.status,
          transcript: providerRun.transcript,
          latencyMs: providerRun.latencyMs,
          error: providerRun.error,
        })
        .from(providerRun)
        .where(eq(providerRun.comparisonRunId, id))
        .all();

      return {
        id: comparison.id,
        createdAt: comparison.createdAt,
        audio: {
          filename: comparison.filename,
          contentType: comparison.contentType,
          sizeBytes: comparison.sizeBytes,
        },
        providerRuns,
      };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Get a transcription comparison",
        tags: ["Comparisons"],
      },
    },
  );

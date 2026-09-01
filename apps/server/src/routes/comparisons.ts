import { and, db, eq } from "@valsea/db";
import { comparisonRun, providerRun } from "@valsea/db/schema/index";
import bytes from "bytes";
import { Elysia, t } from "elysia";
import { fileTypeFromBlob } from "file-type";

import { authPlugin } from "../plugins/auth";
import { providers } from "../providers";
import type { ProviderId, TranscriptionProvider } from "../providers/types";

type CreateComparisonInput = {
  userId: string;
  uploadedAudio: File;
  selectedProviders: ProviderId[];
  dependencies?: {
    providers: Record<ProviderId, TranscriptionProvider>;
  };
};

export async function createComparison({
  userId,
  uploadedAudio,
  selectedProviders,
  dependencies = { providers },
}: CreateComparisonInput) {
  const comparisonRunId = crypto.randomUUID();

  db.transaction((tx) => {
    tx.insert(comparisonRun)
      .values({
        id: comparisonRunId,
        userId,
        filename: uploadedAudio.name,
        contentType: uploadedAudio.type,
        sizeBytes: uploadedAudio.size,
      })
      .run();
    tx.insert(providerRun)
      .values(
        selectedProviders.map((provider) => ({
          comparisonRunId,
          provider,
          status: "pending" as const,
        })),
      )
      .run();
  });

  queueMicrotask(() => {
    void Promise.allSettled(
      selectedProviders.map(async (provider) => {
        const providerStartedAt = performance.now();

        try {
          const result = await dependencies.providers[provider].transcribe({
            audio: uploadedAudio,
          });
          const latencyMs = Math.round(performance.now() - providerStartedAt);

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
            JSON.stringify({
              comparisonRunId,
              provider,
              status: "succeeded",
              latencyMs,
            }),
          );
        } catch {
          const latencyMs = Math.round(performance.now() - providerStartedAt);

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
            JSON.stringify({
              comparisonRunId,
              provider,
              status: "failed",
              latencyMs,
            }),
          );
        }
      }),
    );
  });

  return { comparisonRunId };
}

export const comparisonRoutes = new Elysia()
  .use(authPlugin)
  .post(
    "/comparisons",
    async ({ body: { audio, providers }, user, status }) => {
      const detectedType = await fileTypeFromBlob(audio);

      if (detectedType?.mime !== "audio/wav") {
        return status(422, {
          type: "unsupported_audio_type",
          message: "Only WAV audio is supported",
        });
      }

      const normalizedAudio = new File([audio], audio.name, {
        type: "audio/wav",
      });

      return createComparison({
        userId: user.id,
        uploadedAudio: normalizedAudio,
        selectedProviders: providers,
      });
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
    async ({ params: { id }, user, status }) => {
      const [comparison] = await db
        .select()
        .from(comparisonRun)
        .where(and(eq(comparisonRun.id, id), eq(comparisonRun.userId, user.id)))
        .limit(1);

      if (!comparison) {
        return status(404, {
          type: "comparison_not_found",
          message: "Comparison not found",
        });
      }

      const providerRuns = await db
        .select({
          provider: providerRun.provider,
          status: providerRun.status,
          transcript: providerRun.transcript,
          latencyMs: providerRun.latencyMs,
          error: providerRun.error,
        })
        .from(providerRun)
        .where(eq(providerRun.comparisonRunId, id));

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

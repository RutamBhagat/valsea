import { db, eq } from "@valsea/db";
import { comparisonRun, providerRun } from "@valsea/db/schema/index";
import bytes from "bytes";
import { Elysia, t } from "elysia";
import { fileTypeFromBlob } from "file-type";

import { providers } from "../providers";
import type { ProviderId, TranscriptionProvider } from "../providers/types";

type CreateComparisonInput = {
  uploadedAudio: File;
  selectedProviders: ProviderId[];
  dependencies?: {
    providers: Record<ProviderId, TranscriptionProvider>;
  };
};

export async function createComparison({
  uploadedAudio,
  selectedProviders,
  dependencies = { providers },
}: CreateComparisonInput) {
  const comparisonRunId = crypto.randomUUID();

  const providerRunRows = await Promise.all(
    selectedProviders.map(async (provider) => {
      const providerStartedAt = performance.now();

      try {
        const result = await dependencies.providers[provider].transcribe({
          audio: uploadedAudio,
        });
        const latencyMs = Math.round(performance.now() - providerStartedAt);

        console.info(
          JSON.stringify({
            comparisonRunId,
            provider,
            status: "succeeded",
            latencyMs,
          }),
        );

        return {
          comparisonRunId,
          provider,
          status: "succeeded" as const,
          transcript: result.text,
          latencyMs,
          error: null,
        };
      } catch {
        const latencyMs = Math.round(performance.now() - providerStartedAt);

        console.error(
          JSON.stringify({
            comparisonRunId,
            provider,
            status: "failed",
            latencyMs,
          }),
        );

        return {
          comparisonRunId,
          provider,
          status: "failed" as const,
          transcript: null,
          latencyMs,
          error: "Transcription failed",
        };
      }
    }),
  );

  db.transaction((tx) => {
    tx.insert(comparisonRun)
      .values({
        id: comparisonRunId,
        filename: uploadedAudio.name,
        contentType: uploadedAudio.type,
        sizeBytes: uploadedAudio.size,
      })
      .run();
    tx.insert(providerRun).values(providerRunRows).run();
  });

  return { comparisonRunId };
}

export const comparisonRoutes = new Elysia()
  .post(
    "/comparisons",
    async ({ body: { audio, providers }, status }) => {
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
        uploadedAudio: normalizedAudio,
        selectedProviders: providers,
      });
    },
    {
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
    async ({ params: { id }, status }) => {
      const [comparison] = await db
        .select()
        .from(comparisonRun)
        .where(eq(comparisonRun.id, id))
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
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Get a transcription comparison",
        tags: ["Comparisons"],
      },
    },
  );

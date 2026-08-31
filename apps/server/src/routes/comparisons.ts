import { db, eq } from "@valsea/db";
import { comparisonRun, providerRun } from "@valsea/db/schema/index";
import { Elysia, t } from "elysia";
import { fileTypeFromBlob } from "file-type";

import { providers } from "../providers";
import type { ProviderId, TranscriptionProvider } from "../providers/types";

const maxAudioSizeBytes = 14 * 1024 * 1024;

const supportedAudioTypes = new Map([
  ["audio/flac", "audio/flac"],
  ["audio/mp4", "audio/mp4"],
  ["audio/x-m4a", "audio/mp4"],
  ["audio/mpeg", "audio/mpeg"],
  ["audio/ogg", "audio/ogg"],
  ["audio/wav", "audio/wav"],
]);

interface ComparisonDependencies {
  providers?: Record<ProviderId, TranscriptionProvider>;
}

// function needed for test do not inline
export async function createComparison(
  uploadedAudio: File,
  selectedProviders: ProviderId[],
  dependencies: ComparisonDependencies = {},
) {
  const providerRegistry = dependencies.providers ?? providers;
  const comparisonRunId = crypto.randomUUID();
  const bytes = new Uint8Array(await uploadedAudio.arrayBuffer());

  const providerRunRows = await Promise.all(
    selectedProviders.map(async (provider) => {
      const providerStartedAt = performance.now();

      try {
        const result = await providerRegistry[provider].transcribe({
          audio: bytes,
          filename: uploadedAudio.name,
          contentType: uploadedAudio.type,
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
    async ({ body: { audio: uploadedAudio, providers: selectedProviders }, status }) => {
      const detectedType = await fileTypeFromBlob(uploadedAudio);

      const contentType = detectedType ? supportedAudioTypes.get(detectedType.mime) : undefined;

      if (!contentType) {
        return status(422, {
          type: "unsupported_audio_type",
          message: "Unsupported audio format",
        });
      }

      const normalizedAudio = new File([uploadedAudio], uploadedAudio.name, {
        type: contentType,
      });

      return createComparison(normalizedAudio, selectedProviders);
    },
    {
      body: t.Object({
        audio: t.File({ maxSize: maxAudioSizeBytes }),
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

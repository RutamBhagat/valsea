import { benchmarkManifest } from "@valsea/benchmark";
import { db, eq } from "@valsea/db";
import { benchmarkRun, type BenchmarkProviderResult } from "@valsea/db/schema/index";

import { providers } from "../providers";
import type { ProviderId } from "../providers/types";

const DATASET_SERVER = "https://datasets-server.huggingface.co";
const DATASET = "MERaLiON/Multitask-National-Speech-Corpus-v1";
const CONFIG = "ASR-PART4-Test";
const SPLIT = "train";
const providerIds: ProviderId[] = ["valsea", "qwen", "gemini"];
const tokenPattern = /[\u3400-\u4DBF\u4E00-\u9FFF]|[a-z0-9]+(?:'[a-z0-9]+)?/g;
const speakerTagPattern = /<Speaker\d+>:\s*/g;

export async function runBenchmark(benchmarkRunId: string) {
  const run = db.select().from(benchmarkRun).where(eq(benchmarkRun.id, benchmarkRunId)).get();
  if (!run) return;

  const resultJson = structuredClone(run.resultJson);
  resultJson.providerResults = [];
  resultJson.summary = [];
  resultJson.failures = [];
  resultJson.requestProgress.completed = 0;

  db.update(benchmarkRun)
    .set({ status: "running", resultJson, updatedAt: new Date() })
    .where(eq(benchmarkRun.id, benchmarkRunId))
    .run();

  const lastProviderStart = new Map<ProviderId, number>();

  try {
    for (const sample of benchmarkManifest.samples.slice(0, resultJson.sampleCount)) {
      const sampleId = `part4-${sample.row_index.toString().padStart(4, "0")}`;
      const query = new URLSearchParams({
        dataset: DATASET,
        config: CONFIG,
        split: SPLIT,
        offset: String(sample.row_index),
        length: "1",
      });
      const datasetResponse = await fetch(`${DATASET_SERVER}/rows?${query}`);
      if (!datasetResponse.ok) {
        throw new Error(`Dataset request failed with HTTP ${datasetResponse.status}`);
      }

      const payload = (await datasetResponse.json()) as {
        rows?: Array<{
          row_idx?: number;
          row?: {
            answer?: string;
            context?: Array<{ src?: string; type?: string }>;
          };
        }>;
      };
      const datasetRow = payload.rows?.[0];
      const audioAsset = datasetRow?.row?.context?.[0];

      if (
        datasetRow?.row_idx !== sample.row_index ||
        datasetRow.row?.answer !== sample.reference ||
        typeof audioAsset?.src !== "string" ||
        typeof audioAsset.type !== "string"
      ) {
        throw new Error(`MERaLiON sample ${sampleId} changed`);
      }

      const audioResponse = await fetch(audioAsset.src);
      if (!audioResponse.ok) {
        throw new Error(`Audio request failed with HTTP ${audioResponse.status}`);
      }

      const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
      const hash = new Bun.CryptoHasher("sha256").update(audioBytes).digest("hex");
      if (hash !== sample.audio_sha256) {
        throw new Error("MERaLiON sample audio hash changed");
      }

      const audio = new File([audioBytes], `${sampleId}.wav`, { type: audioAsset.type });

      for (const provider of providerIds) {
        const previousStart = lastProviderStart.get(provider);
        if (provider === "gemini" && previousStart !== undefined) {
          await Bun.sleep(Math.max(0, 21_000 - (performance.now() - previousStart)));
        }

        lastProviderStart.set(provider, performance.now());
        const startedAt = performance.now();
        let providerResult: BenchmarkProviderResult;

        try {
          const transcription = await providers[provider].transcribe({ audio, benchmark: true });
          const referenceTokens =
            sample.reference
              .replace(speakerTagPattern, " ")
              .normalize("NFKC")
              .toLowerCase()
              .match(tokenPattern) ?? [];
          const predictionTokens =
            transcription.text
              .replace(speakerTagPattern, " ")
              .normalize("NFKC")
              .toLowerCase()
              .match(tokenPattern) ?? [];
          let previousDistances = Array.from(
            { length: predictionTokens.length + 1 },
            (_, index) => index,
          );

          for (
            let referenceIndex = 1;
            referenceIndex <= referenceTokens.length;
            referenceIndex += 1
          ) {
            const currentDistances = [referenceIndex];

            for (
              let predictionIndex = 1;
              predictionIndex <= predictionTokens.length;
              predictionIndex += 1
            ) {
              currentDistances.push(
                Math.min(
                  currentDistances[predictionIndex - 1]! + 1,
                  previousDistances[predictionIndex]! + 1,
                  previousDistances[predictionIndex - 1]! +
                    (referenceTokens[referenceIndex - 1] === predictionTokens[predictionIndex - 1]
                      ? 0
                      : 1),
                ),
              );
            }

            previousDistances = currentDistances;
          }

          const edits = previousDistances[predictionTokens.length]!;
          providerResult = {
            provider,
            sampleId,
            reference: sample.reference,
            prediction: transcription.text,
            latencyMs: performance.now() - startedAt,
            errorRate: edits / referenceTokens.length,
            error: null,
            edits,
            referenceTokens: referenceTokens.length,
          };
        } catch (error) {
          providerResult = {
            provider,
            sampleId,
            reference: sample.reference,
            prediction: null,
            latencyMs: performance.now() - startedAt,
            errorRate: null,
            error: error instanceof Error ? error.message : "Transcription failed",
            edits: null,
            referenceTokens: null,
          };
        }

        resultJson.providerResults.push(providerResult);
        resultJson.requestProgress.completed += 1;
        resultJson.summary = providerIds.map((providerId) => {
          const providerResults = resultJson.providerResults.filter(
            (result) => result.provider === providerId,
          );
          const succeeded = providerResults.filter((result) => result.error === null);
          const latencies = succeeded
            .map((result) => result.latencyMs)
            .sort((left, right) => left - right);
          const middle = Math.floor(latencies.length / 2);
          const edits = succeeded.reduce((total, result) => total + (result.edits ?? 0), 0);
          const referenceTokens = succeeded.reduce(
            (total, result) => total + (result.referenceTokens ?? 0),
            0,
          );

          return {
            provider: providerId,
            mixedErrorRate: referenceTokens > 0 ? edits / referenceTokens : null,
            p50LatencyMs:
              latencies.length === 0
                ? null
                : latencies.length % 2 === 0
                  ? (latencies[middle - 1]! + latencies[middle]!) / 2
                  : latencies[middle]!,
            p95LatencyMs: latencies[Math.max(0, Math.ceil(0.95 * latencies.length) - 1)] ?? null,
            succeeded: succeeded.length,
            failed: providerResults.length - succeeded.length,
          };
        });

        db.update(benchmarkRun)
          .set({ status: "running", resultJson, updatedAt: new Date() })
          .where(eq(benchmarkRun.id, benchmarkRunId))
          .run();
      }
    }

    const status = resultJson.providerResults.some((result) => result.error !== null)
      ? "failed"
      : "succeeded";
    db.update(benchmarkRun)
      .set({ status, resultJson, updatedAt: new Date() })
      .where(eq(benchmarkRun.id, benchmarkRunId))
      .run();
  } catch (error) {
    resultJson.failures.push(error instanceof Error ? error.message : "Benchmark failed");
    db.update(benchmarkRun)
      .set({ status: "failed", resultJson, updatedAt: new Date() })
      .where(eq(benchmarkRun.id, benchmarkRunId))
      .run();
  }
}

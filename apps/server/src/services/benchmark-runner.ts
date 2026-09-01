import { benchmarkManifest } from "@valsea/benchmark";
import { db, eq } from "@valsea/db";
import {
  benchmarkRun,
  type BenchmarkProviderResult,
  type BenchmarkResultJson,
  type BenchmarkSummary,
} from "@valsea/db/schema/index";

import { providers } from "../providers";
import type { ProviderId, TranscriptionProvider } from "../providers/types";

const DATASET_SERVER = "https://datasets-server.huggingface.co";
const DATASET = "MERaLiON/Multitask-National-Speech-Corpus-v1";
const CONFIG = "ASR-PART4-Test";
const SPLIT = "train";
const providerIds: ProviderId[] = ["valsea", "qwen", "gemini"];
const tokenPattern = /[\u3400-\u4DBF\u4E00-\u9FFF]|[a-z0-9]+(?:'[a-z0-9]+)?/g;
const speakerTagPattern = /<Speaker\d+>:\s*/g;

type BenchmarkRunnerDependencies = {
  providers?: Record<ProviderId, TranscriptionProvider>;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

type DatasetPayload = {
  rows?: Array<{
    row_idx?: number;
    row?: {
      answer?: string;
      context?: Array<{ src?: string; type?: string }>;
    };
  }>;
};

function mixedTokens(text: string) {
  return (
    text.replace(speakerTagPattern, " ").normalize("NFKC").toLowerCase().match(tokenPattern) ?? []
  );
}

function editDistance(reference: string[], prediction: string[]) {
  let previous = Array.from({ length: prediction.length + 1 }, (_, index) => index);

  for (let referenceIndex = 1; referenceIndex <= reference.length; referenceIndex += 1) {
    const current = [referenceIndex];
    for (let predictionIndex = 1; predictionIndex <= prediction.length; predictionIndex += 1) {
      current.push(
        Math.min(
          current[predictionIndex - 1]! + 1,
          previous[predictionIndex]! + 1,
          previous[predictionIndex - 1]! +
            (reference[referenceIndex - 1] === prediction[predictionIndex - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }

  return previous[prediction.length]!;
}

function score(reference: string, prediction: string) {
  const referenceTokens = mixedTokens(reference);
  const edits = editDistance(referenceTokens, mixedTokens(prediction));
  return {
    edits,
    referenceTokens: referenceTokens.length,
    errorRate: edits / referenceTokens.length,
  };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function percentileNearestRank(values: number[], percentile: number) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(percentile * ordered.length) - 1)] ?? null;
}

function summarize(results: BenchmarkProviderResult[]): BenchmarkSummary[] {
  return providerIds.map((provider) => {
    const providerResults = results.filter((result) => result.provider === provider);
    const succeeded = providerResults.filter((result) => result.error === null);
    const latencies = succeeded.map((result) => result.latencyMs);
    const edits = succeeded.reduce((total, result) => total + (result.edits ?? 0), 0);
    const referenceTokens = succeeded.reduce(
      (total, result) => total + (result.referenceTokens ?? 0),
      0,
    );

    return {
      provider,
      mixedErrorRate: referenceTokens > 0 ? edits / referenceTokens : null,
      p50LatencyMs: median(latencies),
      p95LatencyMs: percentileNearestRank(latencies, 0.95),
      succeeded: succeeded.length,
      failed: providerResults.length - succeeded.length,
    };
  });
}

function saveRun(
  id: string,
  status: "running" | "succeeded" | "failed",
  resultJson: BenchmarkResultJson,
) {
  db.update(benchmarkRun)
    .set({ status, resultJson, updatedAt: new Date() })
    .where(eq(benchmarkRun.id, id))
    .run();
}

async function fetchSample(
  sample: (typeof benchmarkManifest.samples)[number],
  fetchImplementation: typeof fetch,
) {
  const query = new URLSearchParams({
    dataset: DATASET,
    config: CONFIG,
    split: SPLIT,
    offset: String(sample.row_index),
    length: "1",
  });
  const datasetResponse = await fetchImplementation(`${DATASET_SERVER}/rows?${query}`);
  if (!datasetResponse.ok)
    throw new Error(`Dataset request failed with HTTP ${datasetResponse.status}`);

  const payload = (await datasetResponse.json()) as DatasetPayload;
  const datasetRow = payload.rows?.[0];
  const audioAsset = datasetRow?.row?.context?.[0];
  if (
    datasetRow?.row_idx !== sample.row_index ||
    datasetRow.row?.answer !== sample.reference ||
    typeof audioAsset?.src !== "string" ||
    typeof audioAsset.type !== "string"
  ) {
    throw new Error(
      `MERaLiON sample part4-${sample.row_index.toString().padStart(4, "0")} changed`,
    );
  }

  const audioResponse = await fetchImplementation(audioAsset.src);
  if (!audioResponse.ok) throw new Error(`Audio request failed with HTTP ${audioResponse.status}`);
  const audio = new Uint8Array(await audioResponse.arrayBuffer());
  const hash = new Bun.CryptoHasher("sha256").update(audio).digest("hex");
  if (hash !== sample.audio_sha256) throw new Error("MERaLiON sample audio hash changed");

  return { audio, contentType: audioAsset.type };
}

export async function runBenchmark(
  benchmarkRunId: string,
  dependencies: BenchmarkRunnerDependencies = {},
) {
  const providerRegistry = dependencies.providers ?? providers;
  const fetchImplementation = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds: number) => Bun.sleep(milliseconds));
  const now = dependencies.now ?? (() => performance.now());
  const run = db.select().from(benchmarkRun).where(eq(benchmarkRun.id, benchmarkRunId)).get();
  if (!run) return;

  const resultJson = structuredClone(run.resultJson);
  resultJson.providerResults = [];
  resultJson.summary = [];
  resultJson.failures = [];
  resultJson.requestProgress.completed = 0;
  saveRun(benchmarkRunId, "running", resultJson);

  const selectedSamples = benchmarkManifest.samples.slice(0, resultJson.sampleCount);
  const lastProviderStart = new Map<ProviderId, number>();

  try {
    for (const sample of selectedSamples) {
      const sampleId = `part4-${sample.row_index.toString().padStart(4, "0")}`;
      const { audio, contentType } = await fetchSample(sample, fetchImplementation);

      for (const provider of providerIds) {
        const previousStart = lastProviderStart.get(provider);
        if (provider === "gemini" && previousStart !== undefined) {
          await sleep(Math.max(0, 21_000 - (now() - previousStart)));
        }
        lastProviderStart.set(provider, now());
        const startedAt = now();
        let providerResult: BenchmarkProviderResult;

        try {
          const transcription = await providerRegistry[provider].transcribe({
            audio,
            filename: `${sampleId}.wav`,
            contentType,
            benchmark: true,
          });
          const latencyMs = now() - startedAt;
          const scored = score(sample.reference, transcription.text);
          providerResult = {
            provider,
            sampleId,
            reference: sample.reference,
            prediction: transcription.text,
            latencyMs,
            errorRate: scored.errorRate,
            error: null,
            edits: scored.edits,
            referenceTokens: scored.referenceTokens,
          };
        } catch (error) {
          providerResult = {
            provider,
            sampleId,
            reference: sample.reference,
            prediction: null,
            latencyMs: now() - startedAt,
            errorRate: null,
            error: error instanceof Error ? error.message : "Transcription failed",
            edits: null,
            referenceTokens: null,
          };
        }

        resultJson.providerResults.push(providerResult);
        resultJson.requestProgress.completed += 1;
        resultJson.summary = summarize(resultJson.providerResults);
        saveRun(benchmarkRunId, "running", resultJson);
      }
    }

    const status = resultJson.providerResults.some((result) => result.error !== null)
      ? "failed"
      : "succeeded";
    saveRun(benchmarkRunId, status, resultJson);
  } catch (error) {
    resultJson.failures.push(error instanceof Error ? error.message : "Benchmark failed");
    saveRun(benchmarkRunId, "failed", resultJson);
  }
}

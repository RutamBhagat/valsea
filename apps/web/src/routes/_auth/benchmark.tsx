import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";
import { Skeleton } from "@valsea/ui/components/skeleton";

import {
  BenchmarkResults,
  type DisplayResult,
} from "@/components/benchmark/benchmark-results";
import { BenchmarkRunControls } from "@/components/benchmark/benchmark-run-controls";
import { useBenchmark } from "@/hooks/use-benchmark";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

export const Route = createFileRoute("/_auth/benchmark")({
  component: BenchmarkRoute,
});

function BenchmarkLoading() {
  return (
    <div aria-label="Loading benchmark result" className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-40 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function getLiveResult(
  benchmark: ReturnType<typeof useBenchmark>["benchmark"],
): DisplayResult | null {
  if (
    !benchmark ||
    benchmark.status === "running" ||
    benchmark.resultJson.summary.length === 0
  ) {
    return null;
  }

  return {
    manifestVersion: benchmark.resultJson.manifestVersion,
    sampleCount: benchmark.resultJson.sampleCount,
    selectedSampleIds: benchmark.resultJson.selectedSampleIds,
    summary: benchmark.resultJson.summary,
    samples: benchmark.resultJson.providerResults,
  };
}

function BenchmarkRoute() {
  const [sampleCount, setSampleCount] = useState(5);
  const { benchmark, startBenchmark, isStarting, requestError } =
    useBenchmark();
  const isRunning = benchmark?.status === "running";

  const savedBenchmarkQuery = useQuery({
    queryKey: ["committed-benchmark-result"],
    queryFn: async ({ signal }) => {
      const { data } = await api.api.benchmark.get({ fetch: { signal } });
      if (!data || "type" in data)
        throw new Error("Saved benchmark result is not available");
      return data;
    },
    retry: false,
    staleTime: Infinity,
  });

  const liveResult = getLiveResult(benchmark);
  const savedResult: DisplayResult | null = savedBenchmarkQuery.data
    ? {
        manifestVersion: savedBenchmarkQuery.data.manifest_version,
        sampleCount: savedBenchmarkQuery.data.sample_count,
        selectedSampleIds: savedBenchmarkQuery.data.selected_sample_ids,
        summary: savedBenchmarkQuery.data.summary.map((summary) => ({
          provider: summary.provider,
          mixedErrorRate: summary.mixed_error_rate,
          p50LatencyMs: summary.p50_latency_ms,
          p95LatencyMs: summary.p95_latency_ms,
          succeeded: summary.succeeded,
          failed: summary.failed,
        })),
        samples: savedBenchmarkQuery.data.samples.map((sample) => ({
          provider: sample.provider,
          sampleId: sample.sample_id,
          reference: sample.reference,
          prediction: sample.prediction,
          latencyMs: sample.latency_ms,
          error: sample.error,
        })),
      }
    : null;
  const displayedResult = liveResult ?? savedResult;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-5 border-b pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Benchmark providers
          </h1>
        </div>
        <BenchmarkRunControls
          sampleCount={sampleCount}
          onSampleCountChange={setSampleCount}
          onRun={() => startBenchmark(sampleCount)}
          isStarting={isStarting}
          isRunning={isRunning}
          progress={benchmark?.resultJson.requestProgress}
        />
      </header>

      <div className="flex min-w-0 flex-col gap-8">
        {requestError ? (
          <Card role="alert" className="border-destructive/30">
            <CardHeader>
              <CardTitle>Benchmark request failed</CardTitle>
              <CardDescription>{requestError}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {benchmark?.resultJson.failures.map((failure) => (
          <Card key={failure} role="alert" className="border-destructive/30">
            <CardHeader>
              <CardTitle>Benchmark failed</CardTitle>
              <CardDescription>{failure}</CardDescription>
            </CardHeader>
          </Card>
        ))}

        {displayedResult ? (
          <BenchmarkResults result={displayedResult} />
        ) : savedBenchmarkQuery.isPending ? (
          <BenchmarkLoading />
        ) : savedBenchmarkQuery.isError ? (
          <Card role="alert" className="border-destructive/30">
            <CardHeader>
              <CardTitle>Saved result unavailable</CardTitle>
              <CardDescription>
                {getApiErrorMessage(
                  savedBenchmarkQuery.error,
                  "The saved result could not be loaded.",
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

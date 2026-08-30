import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";
import { Skeleton } from "@valsea/ui/components/skeleton";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

export const Route = createFileRoute("/_auth/benchmark")({
  component: BenchmarkRoute,
});

const providerNames: Record<string, string> = {
  valsea: "VALSEA",
  qwen: "Qwen3-ASR-1.7B",
  gemini: "Gemini 3.5 Transcribe",
};

function getProviderName(provider: string) {
  return providerNames[provider] ?? provider;
}

function formatMer(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatLatency(value: number | null) {
  return value === null ? "—" : `${(value / 1000).toFixed(2)} s`;
}

function BenchmarkLoading() {
  return (
    <div aria-label="Loading saved benchmark result" className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-40 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function BenchmarkRoute() {
  const benchmarkQuery = useQuery({
    queryKey: ["committed-benchmark-result"],
    queryFn: async ({ signal }) => {
      const { data } = await api.api.benchmark.get({ fetch: { signal } });
      if (!data || "type" in data) {
        throw new Error("Committed benchmark result is not available");
      }
      return data;
    },
    retry: false,
    staleTime: Infinity,
  });

  return (
    <main className="overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Saved evaluation
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Mandarin-English benchmark
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            A read-only result from fixed MERaLiON code-switching samples. This page does not run
            transcription providers.
          </p>
          {benchmarkQuery.data ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>Manifest v{benchmarkQuery.data.manifest_version}</span>
              <span>{benchmarkQuery.data.sample_count} selected samples</span>
            </div>
          ) : null}
        </header>

        {benchmarkQuery.isPending ? <BenchmarkLoading /> : null}

        {benchmarkQuery.isError ? (
          <Card role="alert" className="max-w-2xl border-destructive/30">
            <CardHeader>
              <CardTitle>Saved result unavailable</CardTitle>
              <CardDescription>
                {getApiErrorMessage(
                  benchmarkQuery.error,
                  "The committed benchmark result could not be loaded.",
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {benchmarkQuery.data ? (
          <>
            <section aria-labelledby="aggregate-results" className="flex flex-col gap-4">
              <div>
                <h2 id="aggregate-results" className="text-xl font-semibold tracking-tight">
                  Aggregate results
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lower MER and latency values are better.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {benchmarkQuery.data.summary.map((result) => (
                  <Card key={result.provider}>
                    <CardHeader>
                      <CardTitle>{getProviderName(result.provider)}</CardTitle>
                      <CardDescription>
                        {result.succeeded} succeeded · {result.failed} failed
                      </CardDescription>
                      <CardAction
                        className={result.failed > 0 ? "text-destructive" : "text-muted-foreground"}
                      >
                        {result.failed > 0 ? "partial" : "complete"}
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-3 gap-3 border-t pt-4">
                        <div>
                          <dt className="text-muted-foreground">MER</dt>
                          <dd className="mt-1 text-lg font-semibold tabular-nums">
                            {formatMer(result.mixed_error_rate)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">p50</dt>
                          <dd className="mt-1 text-lg font-semibold tabular-nums">
                            {formatLatency(result.p50_latency_ms)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">p95</dt>
                          <dd className="mt-1 text-lg font-semibold tabular-nums">
                            {formatLatency(result.p95_latency_ms)}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section aria-labelledby="sample-results" className="flex flex-col gap-4">
              <div>
                <h2 id="sample-results" className="text-xl font-semibold tracking-tight">
                  Sample transcripts
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  References and saved predictions are aligned by sample.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                {benchmarkQuery.data.selected_sample_ids.map((sampleId, sampleIndex) => {
                  const sampleRuns = benchmarkQuery.data.samples.filter(
                    (sample) => sample.sample_id === sampleId,
                  );
                  const reference = sampleRuns[0]?.reference;

                  return (
                    <Card key={sampleId}>
                      <CardHeader className="border-b">
                        <CardTitle>Sample {sampleIndex + 1}</CardTitle>
                        <CardDescription className="font-mono">{sampleId}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2">
                          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Reference
                          </h3>
                          <p className="wrap-break-word text-sm leading-6">
                            {reference ?? "Reference unavailable."}
                          </p>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-3">
                          {benchmarkQuery.data.summary.map(({ provider }) => {
                            const run = sampleRuns.find((sample) => sample.provider === provider);
                            const failed = !run || run.error !== null;

                            return (
                              <article
                                key={provider}
                                className="flex min-w-0 flex-col gap-3 border-l-2 border-foreground/15 bg-muted/40 p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <h3 className="font-medium">{getProviderName(provider)}</h3>
                                  <span
                                    className={
                                      failed
                                        ? "text-xs text-destructive"
                                        : "text-xs text-muted-foreground"
                                    }
                                  >
                                    {failed ? "failed" : formatLatency(run.latency_ms)}
                                  </span>
                                </div>
                                {failed ? (
                                  <p className="wrap-break-word text-sm leading-6 text-destructive">
                                    {run?.error ?? "No saved result for this provider."}
                                  </p>
                                ) : (
                                  <p className="wrap-break-word whitespace-pre-wrap text-sm leading-6">
                                    {run.prediction || "The provider returned an empty transcript."}
                                  </p>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

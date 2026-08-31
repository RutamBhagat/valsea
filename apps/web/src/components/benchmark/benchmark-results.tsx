import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";

const providerNames: Record<string, string> = {
  valsea: "VALSEA",
  qwen: "Qwen3-ASR-1.7B",
  gemini: "Gemini 3.5 Transcribe",
};

type DisplaySummary = {
  provider: string;
  mixedErrorRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  succeeded: number;
  failed: number;
};

type DisplaySample = {
  provider: string;
  sampleId: string;
  reference: string;
  prediction: string | null;
  latencyMs: number;
  error: string | null;
};

export type DisplayResult = {
  manifestVersion: number;
  sampleCount: number;
  selectedSampleIds: string[];
  summary: DisplaySummary[];
  samples: DisplaySample[];
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

export function BenchmarkResults({ result }: { result: DisplayResult }) {
  return (
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
          {result.summary.map((summary) => (
            <Card key={summary.provider}>
              <CardHeader>
                <CardTitle>{getProviderName(summary.provider)}</CardTitle>
                <CardDescription>
                  {summary.succeeded} succeeded · {summary.failed} failed
                </CardDescription>
                <CardAction
                  className={summary.failed > 0 ? "text-destructive" : "text-muted-foreground"}
                >
                  {summary.failed > 0 ? "partial" : "complete"}
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-3 gap-3 border-t pt-4">
                  <div>
                    <dt className="text-muted-foreground">MER</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {formatMer(summary.mixedErrorRate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">p50</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {formatLatency(summary.p50LatencyMs)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">p95</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {formatLatency(summary.p95LatencyMs)}
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
            References and predictions are aligned by sample.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {result.selectedSampleIds.map((sampleId, sampleIndex) => {
            const sampleRuns = result.samples.filter((sample) => sample.sampleId === sampleId);
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
                    {result.summary.map(({ provider }) => {
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
                              {failed ? "failed" : formatLatency(run.latencyMs)}
                            </span>
                          </div>
                          {failed ? (
                            <p className="wrap-break-word text-sm leading-6 text-destructive">
                              {run?.error ?? "No result for this provider."}
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
  );
}

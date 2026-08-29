import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@valsea/ui/components/button";
import { Checkbox } from "@valsea/ui/components/checkbox";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";
import { Input } from "@valsea/ui/components/input";
import { Label } from "@valsea/ui/components/label";
import { type SubmitEvent, useEffect, useState } from "react";

import { type ComparisonProviderId, useComparison } from "@/hooks/use-comparison";

export const Route = createFileRoute("/_auth/")({
  component: HomeComponent,
});

const supportedAudioTypes = [
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/webm",
].join(",");

const providerDetails = [
  { id: "valsea", name: "VALSEA", model: "valsea-transcribe" },
  { id: "qwen", name: "Qwen", model: "Qwen3-ASR-1.7B / Modal" },
  { id: "gemini", name: "Gemini", model: "Gemini 3.5 Transcribe" },
] as const;

type ProviderRunView = {
  status: "succeeded" | "failed";
  transcript: string | null;
  latencyMs: number | null;
  error: string | null;
};

function ProviderResultCard({
  comparisonRunId,
  name,
  model,
  run,
  pending,
}: {
  comparisonRunId: string | null;
  name: string;
  model: string;
  run: ProviderRunView | null;
  pending: boolean;
}) {
  const visibleStatus =
    run?.status ?? (pending ? "running" : comparisonRunId ? "not selected" : "idle");

  return (
    <Card aria-live="polite" className="h-full">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{model}</CardDescription>
        <CardAction className="font-mono text-xs text-muted-foreground">{visibleStatus}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {pending ? (
          <p className="text-sm text-muted-foreground">
            {name} is transcribing the uploaded audio.
          </p>
        ) : !comparisonRunId ? (
          <p className="text-sm text-muted-foreground">
            Start a comparison to see this provider&apos;s transcript and latency.
          </p>
        ) : !run ? (
          <p className="text-sm text-muted-foreground">
            This provider was not selected for this comparison.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 border-b pb-4 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Status</span>
                <span>{visibleStatus}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Provider latency</span>
                <span>{run?.latencyMs == null ? "—" : `${run.latencyMs} ms`}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-medium">Transcript</p>
              {run?.status === "succeeded" ? (
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {run.transcript || "The provider returned an empty transcript."}
                </p>
              ) : run?.status === "failed" ? (
                <p className="text-sm text-destructive">
                  {run.error || "The transcription provider failed."}
                </p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HomeComponent() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<ComparisonProviderId[]>([
    "valsea",
    "qwen",
    "gemini",
  ]);
  const { comparisonRunId, comparison, startComparison, isSubmitting, requestError } =
    useComparison();

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }

    const nextAudioUrl = URL.createObjectURL(audioFile);
    setAudioUrl(nextAudioUrl);

    return () => URL.revokeObjectURL(nextAudioUrl);
  }, [audioFile]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!audioFile || isSubmitting) {
      return;
    }

    startComparison({ audio: audioFile, providers: selectedProviders });
  };

  return (
    <main className="overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
        <header className="flex max-w-2xl flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Speech transcription comparison
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Compare VALSEA, Qwen, and Gemini on the same audio
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Upload one supported audio file and choose at least two providers. Each selected
            provider runs concurrently before the comparison is saved.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <form onSubmit={handleSubmit}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Audio input</CardTitle>
                <CardDescription>FLAC, MP4, MP3, OGG, WAV, or WebM.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="audio-file">Audio file</Label>
                  <Input
                    id="audio-file"
                    type="file"
                    accept={supportedAudioTypes}
                    required
                    disabled={isSubmitting}
                    onChange={(event) => setAudioFile(event.currentTarget.files?.[0] ?? null)}
                  />
                  {audioFile ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">
                        {audioFile.name} · {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {audioUrl ? (
                        <audio
                          aria-label={`Replay ${audioFile.name}`}
                          className="w-full"
                          controls
                          preload="metadata"
                          src={audioUrl}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {requestError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {requestError}
                    </p>
                  ) : null}
                </div>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-sm font-medium">Providers</legend>
                  {providerDetails.map(({ id, name }) => {
                    const checked = selectedProviders.includes(id);
                    const cannotDeselect = checked && selectedProviders.length === 2;

                    return (
                      <div key={id} className="flex items-center gap-2">
                        <Checkbox
                          id={`provider-${id}`}
                          checked={checked}
                          disabled={isSubmitting || cannotDeselect}
                          onCheckedChange={(nextChecked) =>
                            setSelectedProviders((current) =>
                              nextChecked
                                ? current.includes(id)
                                  ? current
                                  : [...current, id]
                                : current.filter((provider) => provider !== id),
                            )
                          }
                        />
                        <Label htmlFor={`provider-${id}`}>{name}</Label>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">Select at least two providers.</p>
                </fieldset>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  disabled={!audioFile || selectedProviders.length < 2 || isSubmitting}
                >
                  {isSubmitting ? "Comparing…" : "Compare selected providers"}
                </Button>
              </CardFooter>
            </Card>
          </form>

          {providerDetails.map(({ id, name, model }) => (
            <ProviderResultCard
              key={id}
              comparisonRunId={comparisonRunId}
              name={name}
              model={model}
              run={
                comparison?.providerRuns.find((providerRun) => providerRun.provider === id) ?? null
              }
              pending={isSubmitting && selectedProviders.includes(id)}
            />
          ))}
        </div>

        {comparisonRunId ? (
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            Comparison {comparisonRunId}
          </p>
        ) : null}
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@valsea/ui/components/button";
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
import { type SubmitEvent, useState } from "react";

import { useComparison } from "@/hooks/use-comparison";

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
  { id: "whisper", name: "Whisper", model: "whisper-large-v3-turbo" },
] as const;

type ProviderRunView = {
  status: "queued" | "running" | "succeeded" | "failed";
  transcript: string | null;
  latencyMs: number | null;
  error: string | null;
};

function ProviderResultCard({
  comparisonRunId,
  name,
  model,
  run,
}: {
  comparisonRunId: string | null;
  name: string;
  model: string;
  run: ProviderRunView | null;
}) {
  const visibleStatus = run?.status ?? (comparisonRunId ? "queued" : "idle");

  return (
    <Card aria-live="polite" className="h-full">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{model}</CardDescription>
        <CardAction className="font-mono text-xs text-muted-foreground">{visibleStatus}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!comparisonRunId ? (
          <p className="text-sm text-muted-foreground">
            Start a comparison to see this provider&apos;s state, transcript, and latency.
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  {visibleStatus === "running"
                    ? `${name} is transcribing the uploaded audio.`
                    : "Waiting for the asynchronous worker to start this provider run."}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HomeComponent() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const { comparisonRunId, comparison, startComparison, isSubmitting, requestError } =
    useComparison();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!audioFile || isSubmitting) {
      return;
    }

    startComparison(audioFile);
  };

  return (
    <main className="overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
        <header className="flex max-w-2xl flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Speech transcription comparison
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Compare VALSEA and Whisper on the same audio
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Upload one supported audio file. Each provider runs independently, and this page follows
            both results until they finish.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <form onSubmit={handleSubmit}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Audio input</CardTitle>
                <CardDescription>FLAC, MP4, MP3, OGG, WAV, or WebM.</CardDescription>
              </CardHeader>
              <CardContent>
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
                    <p className="text-xs text-muted-foreground">
                      {audioFile.name} · {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  ) : null}
                  {requestError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {requestError}
                    </p>
                  ) : null}
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={!audioFile || isSubmitting}>
                  {isSubmitting ? "Starting…" : "Compare VALSEA and Whisper"}
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

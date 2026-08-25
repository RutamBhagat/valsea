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

function HomeComponent() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const { comparisonRunId, comparison, startComparison, isSubmitting, requestError } = useComparison();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!audioFile || isSubmitting) {
      return;
    }

    startComparison(audioFile);
  };

  const providerRun = comparison?.providerRuns.find((run) => run.provider === "valsea") ?? null;
  const visibleStatus = providerRun?.status ?? (comparisonRunId ? "queued" : null);

  return (
    <main className="overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
          <header className="flex max-w-2xl flex-col gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Speech transcription comparison
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Run the same audio through VALSEA
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Upload one supported audio file. The backend stores it, queues the transcription asynchronously,
              and this page follows the provider run until it finishes.
            </p>
          </header>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
                    {isSubmitting ? "Starting…" : "Transcribe with VALSEA"}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <Card aria-live="polite">
              <CardHeader>
                <CardTitle>VALSEA</CardTitle>
                <CardDescription>valsea-transcribe</CardDescription>
                <CardAction className="font-mono text-xs text-muted-foreground">
                  {visibleStatus ?? "idle"}
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {!comparisonRunId ? (
                  <p className="text-sm text-muted-foreground">
                    Start a transcription to see its queue state, transcript, and provider latency here.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 border-b pb-4 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Status</span>
                        <span>{visibleStatus ?? "queued"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Provider latency</span>
                        <span>{providerRun?.latencyMs == null ? "—" : `${providerRun.latencyMs} ms`}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <p className="font-medium">Transcript</p>
                      {providerRun?.status === "succeeded" ? (
                        <p className="whitespace-pre-wrap text-sm leading-6">
                          {providerRun.transcript || "The provider returned an empty transcript."}
                        </p>
                      ) : providerRun?.status === "failed" ? (
                        <p className="text-sm text-destructive">
                          {providerRun.error || "The transcription provider failed."}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {visibleStatus === "running"
                            ? "VALSEA is transcribing the uploaded audio."
                            : "Waiting for the asynchronous worker to start this provider run."}
                        </p>
                      )}
                    </div>

                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      Comparison {comparisonRunId}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
      </div>
    </main>
  );
}

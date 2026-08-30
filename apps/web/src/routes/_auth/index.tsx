import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import ComparisonForm from "@/components/comparison/comparison-form";
import ComparisonResults from "@/components/comparison/comparison-results";
import { type ComparisonProviderId, useComparison } from "@/hooks/use-comparison";

export const Route = createFileRoute("/_auth/")({
  component: HomeComponent,
});

const defaultProviders: ComparisonProviderId[] = ["valsea", "qwen", "gemini"];

function HomeComponent() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [selectedProviders, setSelectedProviders] =
    useState<ComparisonProviderId[]>(defaultProviders);
  const { comparisonRunId, comparison, startComparison, isSubmitting, requestError } =
    useComparison();

  const handleProviderSelectedChange = (provider: ComparisonProviderId, selected: boolean) => {
    setSelectedProviders((current) =>
      selected
        ? current.includes(provider)
          ? current
          : [...current, provider]
        : current.filter((currentProvider) => currentProvider !== provider),
    );
  };

  const handleSubmit = () => {
    if (!audioFile || isSubmitting) return;
    startComparison({ audio: audioFile, providers: selectedProviders });
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Transcription lab
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Compare audio</h1>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <ComparisonForm
          audioFile={audioFile}
          providerCount={selectedProviders.length}
          isSubmitting={isSubmitting}
          requestError={requestError}
          onAudioFileChange={setAudioFile}
          onSubmit={handleSubmit}
        />
        <ComparisonResults
          comparisonRunId={comparisonRunId}
          providerRuns={comparison?.providerRuns ?? []}
          selectedProviders={selectedProviders}
          isSubmitting={isSubmitting}
          onProviderSelectedChange={handleProviderSelectedChange}
        />
      </div>
    </main>
  );
}

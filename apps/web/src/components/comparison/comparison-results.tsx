import type { ComparisonProviderId } from "@/hooks/use-comparison";

import ProviderResultCard, { type ProviderRunView } from "./provider-result-card";

const providers = [
  { id: "valsea", name: "VALSEA", model: "valsea-transcribe", channel: "01" },
  { id: "qwen", name: "Qwen", model: "Qwen3-ASR-1.7B", channel: "02" },
  {
    id: "gemini",
    name: "Gemini",
    model: "Gemini 3.5 Transcribe",
    channel: "03",
  },
] as const;

export default function ComparisonResults({
  comparisonRunId,
  providerRuns,
  selectedProviders,
  isSubmitting,
  onProviderSelectedChange,
}: {
  comparisonRunId: string | null;
  providerRuns: ProviderRunView[];
  selectedProviders: ComparisonProviderId[];
  isSubmitting: boolean;
  onProviderSelectedChange: (provider: ComparisonProviderId, selected: boolean) => void;
}) {
  return (
    <section aria-label="Results" className="min-w-0">
      <div className="grid h-full gap-4 lg:grid-cols-3">
        {providers.map(({ id, name, model, channel }) => {
          const selected = selectedProviders.includes(id);

          return (
            <ProviderResultCard
              key={id}
              comparisonRunId={comparisonRunId}
              name={name}
              model={model}
              channel={channel}
              run={providerRuns.find((providerRun) => providerRun.provider === id) ?? null}
              pending={isSubmitting && selected}
              selected={selected}
              selectionDisabled={isSubmitting || (selected && selectedProviders.length === 2)}
              onSelectedChange={(nextSelected) => onProviderSelectedChange(id, nextSelected)}
            />
          );
        })}
      </div>
    </section>
  );
}

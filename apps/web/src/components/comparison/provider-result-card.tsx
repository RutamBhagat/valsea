import { Badge } from "@valsea/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";
import { Checkbox } from "@valsea/ui/components/checkbox";
import { Skeleton } from "@valsea/ui/components/skeleton";
import { AudioLinesIcon, CheckIcon, Clock3Icon, LoaderCircleIcon } from "lucide-react";

export type ProviderRunView = {
  provider: "valsea" | "qwen" | "gemini";
  status: "succeeded" | "failed";
  transcript: string | null;
  latencyMs: number | null;
  error: string | null;
};

export default function ProviderResultCard({
  comparisonRunId,
  name,
  model,
  channel,
  run,
  pending,
  selected,
  selectionDisabled,
  onSelectedChange,
}: {
  comparisonRunId: string | null;
  name: string;
  model: string;
  channel: string;
  run: ProviderRunView | null;
  pending: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const status = run?.status ?? (pending ? "running" : comparisonRunId ? "not selected" : null);
  const statusVariant =
    status === "failed" ? "destructive" : status === "succeeded" ? "default" : "secondary";

  return (
    <Card aria-live="polite" className="h-full min-h-64">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">CH {channel}</span>
          <CardTitle>{name}</CardTitle>
        </div>
        <CardDescription>{model}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {status ? (
            <Badge variant={statusVariant}>
              {pending ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : null}
              {status}
            </Badge>
          ) : null}
          <Checkbox
            aria-label={`Include ${name}`}
            checked={selected}
            disabled={selectionDisabled}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pt-1">
        {pending ? (
          <div className="flex flex-col gap-3" aria-label={`${name} is transcribing`}>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ) : !comparisonRunId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center text-muted-foreground">
            <AudioLinesIcon className="size-6" />
            <p>{selected ? "Waiting for audio" : "Provider not selected"}</p>
          </div>
        ) : !run ? (
          <div className="flex flex-1 items-center justify-center py-8 text-center text-muted-foreground">
            <p>Not included in this run</p>
          </div>
        ) : run.status === "failed" ? (
          <p className="wrap-break-word text-sm leading-6 text-destructive">
            {run.error || "The provider did not return a transcript."}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckIcon /> Completed
              </span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <Clock3Icon /> {run.latencyMs == null ? "—" : `${run.latencyMs} ms`}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6">
              {run.transcript || "The provider returned an empty transcript."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

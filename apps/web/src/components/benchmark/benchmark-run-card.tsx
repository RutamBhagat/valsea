import { Button } from "@valsea/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@valsea/ui/components/field";
import { Progress, ProgressLabel, ProgressValue } from "@valsea/ui/components/progress";
import { Slider } from "@valsea/ui/components/slider";

interface BenchmarkRunCardProps {
  sampleCount: number;
  onSampleCountChange: (sampleCount: number) => void;
  onRun: () => void;
  isStarting: boolean;
  isRunning: boolean;
  progress?: {
    completed: number;
    total: number;
  };
}

export function BenchmarkRunCard({
  sampleCount,
  onSampleCountChange,
  onRun,
  isStarting,
  isRunning,
  progress,
}: BenchmarkRunCardProps) {
  const isDisabled = isRunning || isStarting;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Run benchmark</CardTitle>
        <CardDescription>
          Select 1 to 10 samples. Each sample sends one request to each provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-disabled={isDisabled}>
            <div className="flex items-baseline justify-between gap-4">
              <FieldLabel htmlFor="sample-count">Sample count</FieldLabel>
              <span className="font-mono text-lg font-semibold tabular-nums">{sampleCount}</span>
            </div>
            <Slider
              id="sample-count"
              aria-label="Benchmark sample count"
              min={1}
              max={10}
              step={1}
              value={sampleCount}
              onValueChange={(value) => onSampleCountChange(value as number)}
              disabled={isDisabled}
            />
            <FieldDescription>Default: 5 · Total requests: {sampleCount * 3}</FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-4">
        <Button type="button" onClick={onRun} disabled={isDisabled}>
          {isStarting ? "Starting benchmark…" : isRunning ? "Benchmark running…" : "Run benchmark"}
        </Button>
        {isRunning && progress ? (
          <Progress value={progress.completed} max={progress.total}>
            <ProgressLabel>Provider requests</ProgressLabel>
            <ProgressValue>
              {progress.completed} / {progress.total}
            </ProgressValue>
          </Progress>
        ) : null}
      </CardFooter>
    </Card>
  );
}

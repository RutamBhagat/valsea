import { Button } from "@valsea/ui/components/button";
import { Progress, ProgressValue } from "@valsea/ui/components/progress";
import { Slider } from "@valsea/ui/components/slider";

type BenchmarkRunControlsProps = {
  sampleCount: number;
  onSampleCountChange: (sampleCount: number) => void;
  onRun: () => void;
  isStarting: boolean;
  isRunning: boolean;
  progress?: {
    completed: number;
    total: number;
  };
};

export function BenchmarkRunControls({
  sampleCount,
  onSampleCountChange,
  onRun,
  isStarting,
  isRunning,
  progress,
}: BenchmarkRunControlsProps) {
  const isDisabled = isRunning || isStarting;

  return (
    <div className="flex w-full items-end gap-3 md:w-auto">
      <div className="min-w-0 flex-1 md:w-52 md:flex-none">
        <div className="mb-2 flex items-baseline justify-between gap-4 text-xs">
          <label htmlFor="sample-count" className="font-medium">
            Samples
          </label>
          <span className="font-mono font-semibold tabular-nums">{sampleCount}</span>
        </div>
        <Slider
          id="sample-count"
          aria-label="Benchmark sample count, 1 to 10"
          min={1}
          max={10}
          step={1}
          value={sampleCount}
          onValueChange={(value) => onSampleCountChange(value as number)}
          disabled={isDisabled}
        />
        {isRunning && progress ? (
          <Progress value={progress.completed} max={progress.total} className="mt-2">
            <ProgressValue className="text-[10px] text-muted-foreground">
              {() => `${progress.completed} / ${progress.total} requests`}
            </ProgressValue>
          </Progress>
        ) : null}
      </div>
      <Button type="button" size="sm" onClick={onRun} disabled={isDisabled}>
        {isStarting ? "Starting…" : isRunning ? "Running…" : "Run benchmark"}
      </Button>
    </div>
  );
}

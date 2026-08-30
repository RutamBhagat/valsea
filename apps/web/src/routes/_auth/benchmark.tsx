import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/benchmark")({
  component: BenchmarkRoute,
});

function BenchmarkRoute() {
  return (
    <main className="overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Benchmark</h1>
      </div>
    </main>
  );
}

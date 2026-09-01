import { EdenFetchError } from "@elysia/eden";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

export function useBenchmark() {
  const [benchmarkRunId, setBenchmarkRunId] = useState<string | null>(null);

  const benchmarkQuery = useQuery({
    queryKey: ["benchmark-run", benchmarkRunId ?? "latest"],
    queryFn: async ({ signal }) => {
      try {
        const { data } = benchmarkRunId
          ? await api.api.benchmarks({ id: benchmarkRunId }).get({ fetch: { signal } })
          : await api.api.benchmarks.latest.get({ fetch: { signal } });
        if (!data || "type" in data) return null;
        return data;
      } catch (error) {
        if (!benchmarkRunId && error instanceof EdenFetchError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    refetchInterval: (query) => (query.state.data?.status === "running" ? 1_000 : false),
    retry: 1,
  });

  const createBenchmark = useMutation({
    mutationFn: async (sampleCount: number) => {
      const { data } = await api.api.benchmarks.post({ sampleCount });
      if (!data || "type" in data) throw new Error("Benchmark creation returned no data");
      return data;
    },
    onSuccess: ({ benchmarkRunId: id }) => setBenchmarkRunId(id),
  });

  const requestError = createBenchmark.error ?? benchmarkQuery.error;

  return {
    benchmark: benchmarkQuery.data ?? null,
    startBenchmark: createBenchmark.mutate,
    isStarting: createBenchmark.isPending,
    isLoading: benchmarkQuery.isPending,
    requestError: requestError ? getApiErrorMessage(requestError) : null,
  };
}

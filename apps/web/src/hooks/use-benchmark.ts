import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

const STORAGE_KEY = "active-benchmark-run-id";

export function useBenchmark() {
  const [benchmarkRunId, setBenchmarkRunId] = useState<string | null>(null);

  useEffect(() => {
    setBenchmarkRunId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const benchmarkQuery = useQuery({
    queryKey: ["benchmark-run", benchmarkRunId],
    enabled: benchmarkRunId !== null,
    queryFn: async ({ signal }) => {
      if (!benchmarkRunId) throw new Error("Benchmark id is required");
      const { data } = await api.api.benchmarks({ id: benchmarkRunId }).get({
        fetch: { signal },
      });
      if (!data || "type" in data) throw new Error("Benchmark run is not available");
      return data;
    },
    refetchInterval: (query) => (query.state.data?.status === "running" ? 1_000 : false),
    retry: 1,
  });

  const createBenchmark = useMutation({
    mutationFn: async (sampleCount: number) => {
      const { data } = await api.api.benchmarks.post({ sampleCount });
      if (!data) throw new Error("Benchmark creation returned no data");
      return data;
    },
    onSuccess: ({ benchmarkRunId: id }) => {
      window.localStorage.setItem(STORAGE_KEY, id);
      setBenchmarkRunId(id);
    },
  });

  const requestError = createBenchmark.error ?? benchmarkQuery.error;

  return {
    benchmark: benchmarkQuery.data ?? null,
    startBenchmark: createBenchmark.mutate,
    isStarting: createBenchmark.isPending,
    requestError: requestError ? getApiErrorMessage(requestError) : null,
  };
}

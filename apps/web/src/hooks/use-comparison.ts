import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

export function useComparison() {
  const [comparisonRunId, setComparisonRunId] = useState<string | null>(null);

  const comparisonQuery = useQuery({
    queryKey: ["comparison", comparisonRunId],
    enabled: comparisonRunId !== null,
    queryFn: async ({ signal }) => {
      if (!comparisonRunId) {
        throw new Error("Comparison id is required");
      }

      const { data } = await api.api.comparisons({ id: comparisonRunId }).get({
        fetch: { signal },
      });

      return data;
    },
    refetchInterval: (query) => {
      const isActive = query.state.data?.providerRuns.some(
        (run) => run.status === "queued" || run.status === "running",
      );

      return isActive ? 1500 : false;
    },
    retry: 1,
  });

  const createComparison = useMutation({
    mutationFn: async (audio: File) => {
      const { data } = await api.api.comparisons.post({ audio });
      if (!data) {
        throw new Error("Comparison creation returned no data");
      }
      return data;
    },
    onMutate: () => {
      setComparisonRunId(null);
    },
    onSuccess: ({ comparisonRunId: id }) => {
      setComparisonRunId(id);
    },
  });

  const requestError = createComparison.error ?? comparisonQuery.error;

  return {
    comparisonRunId,
    comparison: comparisonQuery.data ?? null,
    startComparison: createComparison.mutate,
    isSubmitting: createComparison.isPending,
    requestError: requestError ? getApiErrorMessage(requestError) : null,
  };
}

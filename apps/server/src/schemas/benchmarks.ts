import { t, type Static } from "elysia";

const nullableNumberSchema = t.Union([t.Number(), t.Null()]);

export const committedBenchmarkResultSchema = t.Object(
  {
    manifest_version: t.Integer({ minimum: 1 }),
    dataset: t.String({ minLength: 1 }),
    config: t.String({ minLength: 1 }),
    split: t.String({ minLength: 1 }),
    sample_count: t.Integer({ minimum: 1 }),
    selected_sample_ids: t.Array(t.String({ minLength: 1 })),
    metric: t.String({ minLength: 1 }),
    provider_conditions: t.Record(t.String(), t.String()),
    summary: t.Array(
      t.Object(
        {
          provider: t.String({ minLength: 1 }),
          mixed_error_rate: nullableNumberSchema,
          p50_latency_ms: nullableNumberSchema,
          p95_latency_ms: nullableNumberSchema,
          succeeded: t.Integer({ minimum: 0 }),
          failed: t.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    samples: t.Array(
      t.Object(
        {
          provider: t.String({ minLength: 1 }),
          sample_id: t.String({ minLength: 1 }),
          reference: t.String(),
          prediction: t.Union([t.String(), t.Null()]),
          latency_ms: t.Number({ minimum: 0 }),
          error_rate: nullableNumberSchema,
          error: t.Union([t.String(), t.Null()]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const benchmarkResultUnavailableSchema = t.Object(
  {
    type: t.Literal("benchmark_result_unavailable"),
    message: t.String(),
  },
  { additionalProperties: false },
);

export type CommittedBenchmarkResult = Static<typeof committedBenchmarkResultSchema>;

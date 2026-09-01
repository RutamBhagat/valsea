import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const benchmarkRunStatuses = ["running", "succeeded", "failed"] as const;

export type BenchmarkProvider = "valsea" | "qwen" | "gemini";

export type BenchmarkProviderResult = {
  provider: BenchmarkProvider;
  sampleId: string;
  reference: string;
  prediction: string | null;
  latencyMs: number;
  errorRate: number | null;
  error: string | null;
  edits: number | null;
  referenceTokens: number | null;
};

export type BenchmarkSummary = {
  provider: BenchmarkProvider;
  mixedErrorRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  succeeded: number;
  failed: number;
};

export type BenchmarkResultJson = {
  manifestVersion: number;
  selectedSampleIds: string[];
  sampleCount: number;
  providerResults: BenchmarkProviderResult[];
  summary: BenchmarkSummary[];
  failures: string[];
  requestProgress: {
    completed: number;
    total: number;
  };
};

const timestamp = () => integer({ mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const benchmarkRun = sqliteTable(
  "benchmark_run",
  {
    id: text().primaryKey(),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    status: text({ enum: benchmarkRunStatuses }).notNull(),
    resultJson: text({ mode: "json" }).$type<BenchmarkResultJson>().notNull(),
    createdAt: timestamp().default(now).notNull(),
    updatedAt: timestamp().default(now).notNull(),
  },
  (table) => [index("benchmark_run_user_id_idx").on(table.userId)],
);

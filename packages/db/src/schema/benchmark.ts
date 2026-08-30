import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const benchmarkRunStatuses = ["running", "succeeded", "failed"] as const;

export type BenchmarkResultJson = {
  manifestVersion: number;
  selectedSampleIds: string[];
  sampleCount: number;
  providerResults: unknown[];
  failures: unknown[];
  requestProgress: {
    completed: number;
    total: number;
  };
};

const timestamp = () => integer({ mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const benchmarkRun = sqliteTable("benchmark_run", {
  id: text().primaryKey(),
  status: text({ enum: benchmarkRunStatuses }).notNull(),
  resultJson: text({ mode: "json" }).$type<BenchmarkResultJson>().notNull(),
  createdAt: timestamp().default(now).notNull(),
  updatedAt: timestamp().default(now).notNull(),
});

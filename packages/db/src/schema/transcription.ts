import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const providers = ["valsea", "qwen", "whisper"] as const;
const providerRunStatuses = ["queued", "running", "succeeded", "failed"] as const;
const timestamp = () => integer({ mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const audio = sqliteTable("audio", {
  id: text().primaryKey(),
  objectKey: text().notNull(),
  filename: text().notNull(),
  contentType: text().notNull(),
  sizeBytes: integer().notNull(),
  createdAt: timestamp().default(now).notNull(),
});

export const comparisonRun = sqliteTable("comparison_run", {
  id: text().primaryKey(),
  audioId: text()
    .notNull()
    .references(() => audio.id, { onDelete: "cascade" }),
  createdAt: timestamp().default(now).notNull(),
});

export const providerRun = sqliteTable(
  "provider_run",
  {
    id: text().primaryKey(),
    comparisonRunId: text()
      .notNull()
      .references(() => comparisonRun.id, { onDelete: "cascade" }),
    provider: text({ enum: providers }).notNull(),
    status: text({ enum: providerRunStatuses }).notNull(),
    transcript: text(),
    latencyMs: integer(),
    error: text(),
    startedAt: timestamp(),
    completedAt: timestamp(),
  },
  (table) => [
    unique("provider_run_comparison_run_id_provider_unique").on(
      table.comparisonRunId,
      table.provider,
    ),
  ],
);

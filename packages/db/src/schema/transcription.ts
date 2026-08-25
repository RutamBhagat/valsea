import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("transcription_provider", ["valsea", "qwen", "whisper"]);

export const providerRunStatusEnum = pgEnum("provider_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const audio = pgTable("audio", {
  id: uuid().defaultRandom().primaryKey(),
  objectKey: text().notNull(),
  filename: text().notNull(),
  contentType: text().notNull(),
  sizeBytes: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const comparisonRun = pgTable("comparison_run", {
  id: uuid().defaultRandom().primaryKey(),
  audioId: uuid()
    .notNull()
    .references(() => audio.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const providerRun = pgTable(
  "provider_run",
  {
    id: uuid().defaultRandom().primaryKey(),
    comparisonRunId: uuid()
      .notNull()
      .references(() => comparisonRun.id, { onDelete: "cascade" }),
    provider: providerEnum().notNull(),
    status: providerRunStatusEnum().notNull(),
    transcript: text(),
    latencyMs: integer(),
    error: text(),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique("provider_run_comparison_run_id_provider_unique").on(
      table.comparisonRunId,
      table.provider,
    ),
  ],
);

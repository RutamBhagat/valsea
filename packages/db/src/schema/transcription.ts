import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const providers = ["valsea", "qwen", "gemini"] as const;
const providerRunStatuses = ["succeeded", "failed"] as const;
const timestamp = () => integer({ mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const comparisonRun = sqliteTable(
  "comparison_run",
  {
    id: text().primaryKey(),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    filename: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    createdAt: timestamp().default(now).notNull(),
  },
  (table) => [index("comparison_run_user_id_idx").on(table.userId)],
);

export const providerRun = sqliteTable(
  "provider_run",
  {
    comparisonRunId: text()
      .notNull()
      .references(() => comparisonRun.id, { onDelete: "cascade" }),
    provider: text({ enum: providers }).notNull(),
    status: text({ enum: providerRunStatuses }).notNull(),
    transcript: text(),
    latencyMs: integer().notNull(),
    error: text(),
  },
  (table) => [primaryKey({ columns: [table.comparisonRunId, table.provider] })],
);

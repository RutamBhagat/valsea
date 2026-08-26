import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

import { env } from "@valsea/env/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import * as schema from "./schema";

const dataDirectory = env.NODE_ENV === "production" ? "/data" : `${import.meta.dir}/../../../.data`;

mkdirSync(dataDirectory, { recursive: true });

const sqlite = new Database(`${dataDirectory}/valsea.sqlite`, { create: true });
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA busy_timeout = 5000");
sqlite.run("PRAGMA foreign_keys = ON");

export const db = drizzle({ client: sqlite, schema });

export function createDb() {
  return db;
}

export function migrateDatabase() {
  const migrationsFolder =
    env.NODE_ENV === "production" ? "/app/migrations" : `${import.meta.dir}/migrations`;

  migrate(db, { migrationsFolder });
}

export * from "drizzle-orm";

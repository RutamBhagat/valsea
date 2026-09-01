import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.NODE_ENV === "production" ? "/data/valsea.sqlite" : "../../.data/valsea.sqlite";

mkdirSync(dirname(databaseUrl), { recursive: true });

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
  },
});

import { neon } from "@neondatabase/serverless";
import { env } from "@valsea/env/server";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export function createDb() {
  const sql = neon(env.DATABASE_URL);
  return drizzle(sql, { schema, casing: "snake_case" });
}

export const db = createDb();

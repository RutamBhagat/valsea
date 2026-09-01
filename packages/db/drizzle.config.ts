import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.NODE_ENV === "production" ? "/data/valsea.sqlite" : "../../.data/valsea.sqlite",
  },
});

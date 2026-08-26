import { migrateDatabase } from "@valsea/db";

import { app } from "./app";
import { ensureLocalGcpResources } from "./lib/gcp";

migrateDatabase();
await ensureLocalGcpResources();

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});

const shutdown = () => {
  void app.stop();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

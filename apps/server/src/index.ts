import { migrateDatabase } from "@valsea/db";

import { app } from "./app";

migrateDatabase();

app.listen(8001, () => {
  console.log("Server is running on http://localhost:8001");
});

const shutdown = () => {
  void app.stop();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

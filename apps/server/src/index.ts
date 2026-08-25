import { app } from "./app";
import { ensureLocalGcpResources } from "./lib/gcp";

await ensureLocalGcpResources();

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});

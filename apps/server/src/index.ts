import { app } from "./app";

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});

const shutdown = () => {
  void app.stop();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

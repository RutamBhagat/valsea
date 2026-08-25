import { auth } from "@valsea/auth";
import { Elysia } from "elysia";

import { comparisonRoutes } from "./comparisons";

export const apiRoutes = new Elysia({ prefix: "/api" }).guard(
  {
    beforeHandle: async ({ request, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });

      if (!session) {
        return status(401, { error: "Unauthorized" });
      }
    },
  },
  (app) => app.use(comparisonRoutes),
);

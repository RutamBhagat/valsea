import { auth } from "@valsea/auth";
import { Elysia } from "elysia";

export const authPlugin = new Elysia({ name: "better-auth" }).mount(auth.handler).macro({
  auth: {
    async resolve({ request: { headers }, status }) {
      const current = await auth.api.getSession({ headers });
      if (!current) {
        return status(401, { type: "unauthorized", message: "Unauthorized" });
      }

      return {
        user: current.user,
        session: current.session,
      };
    },
  },
});

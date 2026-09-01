import { Elysia } from "elysia";

import { benchmarkRoutes } from "./benchmarks";
import { comparisonRoutes } from "./comparisons";

export const apiRoutes = new Elysia({ prefix: "/api" }).use(comparisonRoutes).use(benchmarkRoutes);

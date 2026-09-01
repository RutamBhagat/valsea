import { t } from "elysia";

export const datasetPayloadSchema = t.Object({
  rows: t.Array(
    t.Object({
      row_idx: t.Number(),
      row: t.Object({
        answer: t.String(),
        context: t.Array(t.Object({ src: t.String(), type: t.String() })),
      }),
    }),
  ),
});

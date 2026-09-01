import { env } from "@valsea/env/server";
import OpenAI, { toFile } from "openai";

import type { TranscriptionProvider } from "./types";

const client = new OpenAI({
  apiKey: env.VALSEA_API_KEY,
  baseURL: "https://api.valsea.ai/v1",
});

export const valsea: TranscriptionProvider = {
  transcribe: async ({ audio, filename, contentType, benchmark }) => {
    const result = await client.audio.transcriptions.create(
      {
        file: await toFile(audio, filename, { type: contentType }),
        model: "valsea-transcribe",
        language: "english",
        ...(benchmark
          ? {
              enable_correction: false,
              enable_tags: false,
            }
          : {}),
      },
      { signal: AbortSignal.timeout(2 * 60_000) },
    );

    return { text: result.text };
  },
};

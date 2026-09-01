import { env } from "@valsea/env/server";
import OpenAI from "openai";

import type { TranscriptionProvider } from "./types";

const client = new OpenAI({
  apiKey: env.VALSEA_API_KEY,
  baseURL: "https://api.valsea.ai/v1",
});

export const valsea: TranscriptionProvider = {
  transcribe: async ({ audio, benchmark }) => {
    const result = await client.audio.transcriptions.create(
      {
        file: audio,
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

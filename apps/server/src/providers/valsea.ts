import { env } from "@valsea/env/server";
import OpenAI, { toFile } from "openai";

import type { TranscriptionProvider } from "./types";

const client = new OpenAI({
  apiKey: env.VALSEA_API_KEY,
  baseURL: "https://api.valsea.ai/v1",
});

export const valsea: TranscriptionProvider = {
  async transcribe({ audio, filename, contentType }) {
    const result = await client.audio.transcriptions.create({
      file: await toFile(audio, filename, { type: contentType }),
      model: "valsea-transcribe",
    });

    return { text: result.text };
  },
};

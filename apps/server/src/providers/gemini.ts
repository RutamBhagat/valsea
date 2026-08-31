import { GoogleGenAI } from "@google/genai";
import { env } from "@valsea/env/server";

import type { TranscriptionProvider } from "./types";

const model = "gemini-3.5-transcribe";

export const gemini: TranscriptionProvider = {
  async transcribe({ audio, contentType }) {
    const client = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: { timeout: 2 * 60_000 },
    });
    const interaction = await client.interactions.create({
      model,
      input: {
        type: "audio",
        data: Buffer.from(audio).toString("base64"),
        mime_type: contentType,
      },
      generation_config: {
        transcription_config: { mode: "verbatim" },
      },
    });

    const text = interaction.output_text;
    if (typeof text !== "string") {
      throw new Error("Gemini returned an invalid transcription response");
    }

    return { text };
  },
};

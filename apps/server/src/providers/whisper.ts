import { env } from "@valsea/env/server";

import type { TranscriptionProvider } from "./types";

const model = "@cf/openai/whisper-large-v3-turbo";

interface WorkersAiResponse {
  success: boolean;
  result?: {
    text?: unknown;
    transcription_info?: { text?: unknown };
  };
}

export const whisper: TranscriptionProvider = {
  async transcribe({ audio }) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: Buffer.from(audio).toString("base64"),
          task: "transcribe",
        }),
        signal: AbortSignal.timeout(2 * 60_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Workers AI request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as WorkersAiResponse;
    const text = payload.result?.text ?? payload.result?.transcription_info?.text;

    if (!payload.success || typeof text !== "string") {
      throw new Error("Workers AI returned an invalid transcription response");
    }

    return { text };
  },
};

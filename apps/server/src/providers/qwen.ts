import { env } from "@valsea/env/server";

import type { TranscriptionProvider } from "./types";

type QwenResponse = {
  text?: unknown;
};

export const qwen: TranscriptionProvider = {
  transcribe: async ({ audio }) => {
    const response = await fetch(env.QWEN_MODAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": audio.type,
        "Modal-Key": env.MODAL_PROXY_TOKEN_ID,
        "Modal-Secret": env.MODAL_PROXY_TOKEN_SECRET,
      },
      body: audio,
      signal: AbortSignal.timeout(5 * 60_000),
    });

    if (!response.ok) {
      throw new Error(`Qwen Modal request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as QwenResponse;
    if (typeof payload.text !== "string") {
      throw new Error("Qwen Modal returned an invalid transcription response");
    }

    return { text: payload.text };
  },
};

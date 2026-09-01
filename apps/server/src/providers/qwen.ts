import { env } from "@valsea/env/server";
import { ModalClient } from "modal";

import type { TranscriptionProvider } from "./types";

type QwenResponse = {
  text?: unknown;
};

const modal = new ModalClient({
  tokenId: env.MODAL_TOKEN_ID,
  tokenSecret: env.MODAL_TOKEN_SECRET,
});

const transcriptionMethod = modal.cls
  .fromName("qwen3-asr", "QwenASR")
  .then(async (cls) => (await cls.instance()).method("transcribe_remote"));

export const qwen: TranscriptionProvider = {
  transcribe: async ({ audio }) => {
    const method = await transcriptionMethod;
    const payload = (await method.remote([
      new Uint8Array(await audio.arrayBuffer()),
    ])) as QwenResponse;

    if (typeof payload.text !== "string") {
      throw new Error("Qwen Modal returned an invalid transcription response");
    }

    return { text: payload.text };
  },
};

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

const createTranscriptionMethod = () =>
  modal.cls
    .fromName("qwen3-asr", "QwenASR")
    .then(async (cls) => (await cls.instance()).method("transcribe_remote"));

let transcriptionMethod: ReturnType<typeof createTranscriptionMethod> | undefined;
const getTranscriptionMethod = () => (transcriptionMethod ??= createTranscriptionMethod());

export const qwen: TranscriptionProvider = {
  transcribe: async ({ audio }) => {
    const method = await getTranscriptionMethod();
    const payload = (await method.remote([
      new Uint8Array(await audio.arrayBuffer()),
    ])) as QwenResponse;

    if (typeof payload.text !== "string") {
      throw new Error("Qwen Modal returned an invalid transcription response");
    }

    return { text: payload.text };
  },
};

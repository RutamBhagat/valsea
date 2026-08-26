import type { ProviderId, TranscriptionProvider } from "./types";
import { valsea } from "./valsea";
import { whisper } from "./whisper";

const qwen: TranscriptionProvider = {
  transcribe() {
    throw new Error("Qwen provider is not implemented");
  },
};

export const providers = {
  valsea,
  whisper,
  qwen,
} satisfies Record<ProviderId, TranscriptionProvider>;

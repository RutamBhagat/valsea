import type { ProviderId, TranscriptionProvider } from "./types";
import { qwen } from "./qwen";
import { valsea } from "./valsea";
import { whisper } from "./whisper";

export const providers = {
  valsea,
  whisper,
  qwen,
} satisfies Record<ProviderId, TranscriptionProvider>;

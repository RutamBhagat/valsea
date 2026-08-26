import type { ProviderId, TranscriptionProvider } from "./types";
import { gemini } from "./gemini";
import { qwen } from "./qwen";
import { valsea } from "./valsea";

export const providers = {
  valsea,
  gemini,
  qwen,
} satisfies Record<ProviderId, TranscriptionProvider>;

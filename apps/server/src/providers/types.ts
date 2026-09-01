export type ProviderId = "valsea" | "qwen" | "gemini";

export type TranscriptionInput = {
  audio: Uint8Array;
  filename: string;
  contentType: string;
  benchmark?: boolean;
};

export type TranscriptionProvider = {
  transcribe: (input: TranscriptionInput) => Promise<{ text: string }>;
};

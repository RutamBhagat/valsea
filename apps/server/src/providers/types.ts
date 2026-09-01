export type ProviderId = "valsea" | "qwen" | "gemini";

export type TranscriptionInput = {
  audio: File;
  benchmark?: boolean;
};

export type TranscriptionProvider = {
  transcribe: (input: TranscriptionInput) => Promise<{ text: string }>;
};

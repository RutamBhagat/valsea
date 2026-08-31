export type ProviderId = "valsea" | "qwen" | "gemini";

export interface TranscriptionInput {
  audio: Uint8Array;
  filename: string;
  contentType: string;
  benchmark?: boolean;
}

export interface TranscriptionProvider {
  transcribe: (input: TranscriptionInput) => Promise<{ text: string }>;
}

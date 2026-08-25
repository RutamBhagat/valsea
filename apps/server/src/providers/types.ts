export type ProviderId = "valsea" | "qwen" | "whisper";

export interface TranscriptionInput {
  audio: Uint8Array;
  filename: string;
  contentType: string;
}

export interface TranscriptionProvider {
  transcribe: (input: TranscriptionInput) => Promise<{ text: string }>;
}

import { Field, FieldDescription, FieldLabel } from "@valsea/ui/components/field";
import { FileAudioIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";

const supportedAudioTypes = {
  "audio/flac": [".flac"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/mpeg": [".mp3"],
  "audio/ogg": [".ogg"],
  "audio/wav": [".wav"],
  "audio/webm": [".webm"],
  "video/webm": [".webm"],
};

const audioTypeLabels: Record<string, string> = {
  "audio/flac": "FLAC",
  "audio/mp4": "MP4",
  "audio/mpeg": "MP3",
  "audio/ogg": "OGG",
  "audio/wav": "WAV",
  "audio/webm": "WEBM",
  "video/webm": "WEBM",
};

function DropzoneContent({
  audioFile,
  isDragActive,
  isDragReject,
}: {
  audioFile: File | null;
  isDragActive: boolean;
  isDragReject: boolean;
}) {
  let title = "Provide an audio file";
  let description = "Drop it here or click to browse";
  let footer = "FLAC · MP3 · MP4 · OGG · WAV · WEBM";

  if (isDragReject) {
    title = "Unsupported audio format";
    description = "Choose one of the supported formats";
  } else if (isDragActive) {
    title = "Release to select";
    description = audioFile ? "Replace the current selection" : "Use this file for comparison";
  } else if (audioFile) {
    description = `${audioTypeLabels[audioFile.type] ?? "AUDIO"} · ${(
      audioFile.size /
      1024 /
      1024
    ).toFixed(2)} MB selected`;
    footer = "Drop or click to choose a different file";
  }

  return (
    <>
      <FileAudioIcon className="size-6 text-muted-foreground" />
      <span className="font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{footer}</span>
    </>
  );
}

export default function AudioDropzone({
  audioFile,
  disabled,
  requestError,
  onAudioFileChange,
}: {
  audioFile: File | null;
  disabled: boolean;
  requestError: string | null;
  onAudioFileChange: (file: File) => void;
}) {
  const [fileError, setFileError] = useState<string | null>(null);
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const [nextFile] = acceptedFiles;

      if (nextFile) {
        onAudioFileChange(nextFile);
        setFileError(null);
        return;
      }

      setFileError(fileRejections[0]?.errors[0]?.message ?? "Choose a supported audio file.");
    },
    [onAudioFileChange],
  );
  const { getInputProps, getRootProps, isDragActive, isDragReject } = useDropzone({
    accept: supportedAudioTypes,
    disabled,
    maxFiles: 1,
    multiple: false,
    onDrop,
  });
  const error = fileError || requestError;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="audio-file" className="sr-only">
        Audio file
      </FieldLabel>
      <div
        {...getRootProps({
          "aria-label": "Drag and drop audio, or choose a file",
          className: `flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 ${
            isDragReject
              ? "border-destructive bg-destructive/5 text-destructive"
              : isDragActive
                ? "border-foreground bg-muted"
                : "bg-muted/30 hover:bg-muted/60"
          }`,
          role: "button",
        })}
      >
        <input
          {...getInputProps({
            "aria-invalid": Boolean(error),
            id: "audio-file",
          })}
        />
        <DropzoneContent
          audioFile={audioFile}
          isDragActive={isDragActive}
          isDragReject={isDragReject}
        />
      </div>
      {error ? (
        <FieldDescription role="alert" className="text-destructive">
          {error}
        </FieldDescription>
      ) : null}
    </Field>
  );
}

import { Button } from "@valsea/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@valsea/ui/components/card";
import { FieldGroup } from "@valsea/ui/components/field";
import { LoaderCircleIcon } from "lucide-react";
import { type SubmitEvent, useEffect, useState } from "react";

import AudioDropzone from "./audio-dropzone";

export default function ComparisonForm({
  audioFile,
  providerCount,
  isSubmitting,
  requestError,
  onAudioFileChange,
  onSubmit,
}: {
  audioFile: File | null;
  providerCount: number;
  isSubmitting: boolean;
  requestError: string | null;
  onAudioFileChange: (file: File) => void;
  onSubmit: () => void;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }

    const nextAudioUrl = URL.createObjectURL(audioFile);
    setAudioUrl(nextAudioUrl);
    return () => URL.revokeObjectURL(nextAudioUrl);
  }, [audioFile]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="h-full xl:sticky xl:top-8">
      <Card className="h-full">
        <CardHeader className="border-b">
          <CardTitle>New comparison</CardTitle>
          <CardDescription>Choose an audio file.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <AudioDropzone
              audioFile={audioFile}
              disabled={isSubmitting}
              requestError={requestError}
              onAudioFileChange={onAudioFileChange}
            />
            {audioUrl ? (
              <audio
                aria-label={`Replay ${audioFile?.name ?? "selected audio"}`}
                className="w-full"
                controls
                preload="metadata"
                src={audioUrl}
              />
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            type="submit"
            disabled={!audioFile || providerCount < 2 || isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : null}
            {isSubmitting ? "Comparing" : "Run comparison"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

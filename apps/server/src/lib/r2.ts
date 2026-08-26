import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@valsea/env/server";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadAudio(key: string, body: Uint8Array, contentType: string) {
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_AUDIO_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function downloadAudio(key: string) {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.R2_AUDIO_BUCKET,
      Key: key,
    }),
  );

  if (!response.Body) throw new Error(`R2 object ${key} has no body`);
  return response.Body.transformToByteArray();
}

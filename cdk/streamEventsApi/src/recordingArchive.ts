import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

import { getR2Config } from './r2Config';
import { buildR2ObjectKey, normalizeKeyPrefix } from './recordingPaths';
import { getR2S3Client } from './r2Client';

const listAllKeysUnderPrefix = async (
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<string[]> => {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    for (const object of response.Contents ?? []) {
      if (object.Key) {
        keys.push(object.Key);
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
};

const streamToBuffer = async (body: unknown): Promise<Buffer> => {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  if (body && typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    return Buffer.from(await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
  }

  throw new Error('Unsupported S3 object body type');
};

/**
 * Mirror canonical S3 recording keys to Cloudflare R2 (same key layout).
 */
export const replicateCanonicalPrefixToR2 = async ({
  s3Client,
  s3Bucket,
  canonicalPrefix
}: {
  s3Client: S3Client;
  s3Bucket: string;
  canonicalPrefix: string;
}): Promise<void> => {
  const r2Client = getR2S3Client();
  const r2Config = getR2Config();

  if (!r2Client || !r2Config) {
    return;
  }

  const prefixWithSlash = `${normalizeKeyPrefix(canonicalPrefix)}/`;
  const keys = await listAllKeysUnderPrefix(s3Client, s3Bucket, prefixWithSlash);

  await Promise.all(
    keys.map(async (key) => {
      const object = await s3Client.send(
        new GetObjectCommand({
          Bucket: s3Bucket,
          Key: key
        })
      );

      const body = await streamToBuffer(object.Body);
      const r2Key = buildR2ObjectKey(key);

      await r2Client.send(
        new PutObjectCommand({
          Bucket: r2Config.bucket,
          Key: r2Key,
          Body: body,
          ContentType: object.ContentType ?? 'application/octet-stream'
        })
      );
    })
  );
};

/**
 * Copy IVS-native recording artifacts into the canonical `recordings/` layout,
 * then mirror the canonical prefix to R2 when configured.
 */
export const archiveRecordingPrefix = async ({
  client,
  bucket,
  sourcePrefix,
  destinationPrefix
}: {
  client: S3Client;
  bucket: string;
  sourcePrefix: string;
  destinationPrefix: string;
}): Promise<void> => {
  const normalizedSource = normalizeKeyPrefix(sourcePrefix);
  const normalizedDestination = normalizeKeyPrefix(destinationPrefix);

  if (!normalizedSource || !normalizedDestination) {
    return;
  }

  const sourceWithSlash = `${normalizedSource}/`;
  const destinationWithSlash = `${normalizedDestination}/`;
  const keys = await listAllKeysUnderPrefix(client, bucket, sourceWithSlash);

  await Promise.all(
    keys.map(async (key) => {
      const relativeKey = key.slice(sourceWithSlash.length);
      const destinationKey = `${destinationWithSlash}${relativeKey}`;

      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${key}`,
          Key: destinationKey
        })
      );
    })
  );

  await replicateCanonicalPrefixToR2({
    s3Client: client,
    s3Bucket: bucket,
    canonicalPrefix: normalizedDestination
  });
};

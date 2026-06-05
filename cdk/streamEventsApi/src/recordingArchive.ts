import {
  CopyObjectCommand,
  ListObjectsV2Command,
  S3Client
} from '@aws-sdk/client-s3';

import { normalizeKeyPrefix } from './recordingPaths';

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

/**
 * Copy IVS-native recording artifacts into the canonical `recordings/` layout.
 *
 * TODO(R2): After S3 copy succeeds, replicate the same keys to R2 (S3-compatible API).
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
};

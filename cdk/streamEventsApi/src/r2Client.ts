import { S3Client } from '@aws-sdk/client-s3';

import { getR2Config } from './r2Config';

let cachedClient: S3Client | null | undefined;

export const getR2S3Client = (): S3Client | null => {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const config = getR2Config();
  if (!config) {
    cachedClient = null;

    return null;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return cachedClient;
};

/** @internal Test helper */
export const resetR2ClientCache = (): void => {
  cachedClient = undefined;
};

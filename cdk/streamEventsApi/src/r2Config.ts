export interface R2Config {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export const getR2Config = (): R2Config | null => {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_KEY;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const publicBaseUrlRaw = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }

  let publicBaseUrl = publicBaseUrlRaw?.trim() ?? '';
  if (publicBaseUrl && !publicBaseUrl.startsWith('http')) {
    publicBaseUrl = `https://${publicBaseUrl}`;
  }
  publicBaseUrl = publicBaseUrl.replace(/\/+$/, '');

  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
};

export const isR2ReplicationEnabled = (): boolean => getR2Config() !== null;

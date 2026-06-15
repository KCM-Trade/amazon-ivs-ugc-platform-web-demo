/**
 * Canonical S3 layout for IVS recordings (shared across low-latency + real-time).
 *
 * IVS writes to AWS-managed prefixes first; we copy into this layout on recording end.
 * The same canonical keys are mirrored to Cloudflare R2 when R2 env vars are set.
 *
 *   recordings/low-latency/{channelId}/{sessionId}/media/hls/master.m3u8
 *   recordings/real-time/{stageId}/{sessionId}/{participantId}/media/hls/multivariant.m3u8
 */

import { getR2Config } from './r2Config';

export const RECORDINGS_ROOT = 'recordings';
export const LOW_LATENCY_SEGMENT = 'low-latency';
export const REAL_TIME_SEGMENT = 'real-time';

export const LOW_LATENCY_MANIFEST = 'master.m3u8';
export const REAL_TIME_MANIFEST = 'multivariant.m3u8';

export const normalizeKeyPrefix = (prefix: string): string =>
  prefix.replace(/\/+$/, '');

export const extractResourceIdFromArn = (arn: string): string => {
  const index = arn.lastIndexOf('/');
  return index >= 0 ? arn.slice(index + 1) : '';
};

export const buildCanonicalLowLatencyPrefix = (
  channelId: string,
  sessionId: string
): string =>
  `${RECORDINGS_ROOT}/${LOW_LATENCY_SEGMENT}/${channelId}/${sessionId}/`;

export const buildCanonicalRealTimePrefix = (
  stageId: string,
  sessionId: string,
  participantId: string
): string =>
  `${RECORDINGS_ROOT}/${REAL_TIME_SEGMENT}/${stageId}/${sessionId}/${participantId}/`;

export const buildManifestKey = (
  prefix: string,
  manifestName: string
): string => `${normalizeKeyPrefix(prefix)}/media/hls/${manifestName}`;

export const resolveLowLatencySessionId = (detail: {
  stream_id?: string;
  recording_session_id?: string;
  recording_s3_key_prefix?: string;
}): string => {
  if (detail.stream_id) {
    return detail.stream_id;
  }
  if (detail.recording_session_id) {
    return detail.recording_session_id;
  }
  const prefix = detail.recording_s3_key_prefix;
  if (prefix) {
    const segments = normalizeKeyPrefix(prefix).split('/');
    const last = segments[segments.length - 1];
    if (last) {
      return last;
    }
  }
  return '';
};

export const resolveRealTimeSessionParts = (
  keyPrefix: string,
  detail: { session_id?: string; participant_id?: string }
): { sessionId: string; participantId: string } => {
  const segments = normalizeKeyPrefix(keyPrefix).split('/');
  return {
    sessionId: detail.session_id || segments[1] || '',
    participantId: detail.participant_id || segments[2] || ''
  };
};

export const buildR2ObjectKey = (canonicalS3Key: string): string =>
  normalizeKeyPrefix(canonicalS3Key);

export const buildPlaybackUrlFromS3Key = (
  bucketName: string,
  region: string | undefined,
  key: string
): string => {
  const hostRegion = region || process.env.AWS_REGION || process.env.REGION;
  const playbackBase = `https://${bucketName}.s3.${hostRegion}.amazonaws.com/`;

  return (
    playbackBase +
    key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
  );
};

export const buildPlaybackUrl = (
  bucketName: string,
  region: string | undefined,
  canonicalManifestKey: string
): string => {
  const r2Base = getR2Config()?.publicBaseUrl;
  if (r2Base) {
    const r2Key = buildR2ObjectKey(canonicalManifestKey);

    return (
      `${r2Base}/` +
      r2Key
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')
    );
  }

  return buildPlaybackUrlFromS3Key(bucketName, region, canonicalManifestKey);
};

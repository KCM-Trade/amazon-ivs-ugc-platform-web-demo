import {
  buildCanonicalLowLatencyPrefix,
  buildCanonicalRealTimePrefix,
  buildManifestKey,
  buildPlaybackUrl,
  buildR2ObjectKey,
  resolveLowLatencySessionId,
  resolveRealTimeSessionParts
} from '../recordingPaths';

describe('recordingPaths', () => {
  it('builds canonical low-latency prefix', () => {
    expect(buildCanonicalLowLatencyPrefix('chan123', 'st-abc')).toBe(
      'recordings/low-latency/chan123/st-abc/'
    );
  });

  it('builds canonical real-time prefix', () => {
    expect(buildCanonicalRealTimePrefix('stage1', 'st-sess', 'part1')).toBe(
      'recordings/real-time/stage1/st-sess/part1/'
    );
  });

  it('resolves low-latency session id from stream_id', () => {
    expect(
      resolveLowLatencySessionId({
        stream_id: 'st-xyz',
        recording_s3_key_prefix: 'ivs/v1/1/chan/2026/1/1/1/1/rec'
      })
    ).toBe('st-xyz');
  });

  it('resolves real-time session parts from key prefix', () => {
    expect(
      resolveRealTimeSessionParts(
        'verG9X1DAwQB/st-1delmaMyFiUE2/E8uksaom734c/2026-06-05T03-27-32Z',
        {}
      )
    ).toEqual({
      sessionId: 'st-1delmaMyFiUE2',
      participantId: 'E8uksaom734c'
    });
  });

  it('builds manifest key under canonical prefix', () => {
    expect(
      buildManifestKey('recordings/real-time/s1/s2/p1/', 'multivariant.m3u8')
    ).toBe('recordings/real-time/s1/s2/p1/media/hls/multivariant.m3u8');
  });

  it('builds R2 playback url with same key layout as S3', () => {
    process.env.CLOUDFLARE_R2_BUCKET = 'live-app-uat';
    process.env.CLOUDFLARE_R2_ACCESS_KEY = 'key';
    process.env.CLOUDFLARE_R2_SECRET_KEY = 'secret';
    process.env.CLOUDFLARE_R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL = 'video-uat.siegpath.com';

    expect(
      buildR2ObjectKey('recordings/low-latency/chan/st/media/hls/master.m3u8')
    ).toBe('recordings/low-latency/chan/st/media/hls/master.m3u8');

    expect(
      buildPlaybackUrl('aws-bucket', 'ap-northeast-1', 'recordings/low-latency/chan/st/media/hls/master.m3u8')
    ).toBe(
      'https://video-uat.siegpath.com/recordings/low-latency/chan/st/media/hls/master.m3u8'
    );

    delete process.env.CLOUDFLARE_R2_BUCKET;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_SECRET_KEY;
    delete process.env.CLOUDFLARE_R2_ENDPOINT;
    delete process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
  });
});

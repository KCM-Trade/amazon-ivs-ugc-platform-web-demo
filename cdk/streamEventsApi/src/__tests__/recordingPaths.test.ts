import {
  buildCanonicalLowLatencyPrefix,
  buildCanonicalRealTimePrefix,
  buildManifestKey,
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
});

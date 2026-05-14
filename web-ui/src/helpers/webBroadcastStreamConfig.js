import {
  BROADCAST_STREAM_CONFIG_PRESETS,
  CHANNEL_TYPE
} from '../constants';

/** Video bitrate caps (kbps) aligned with ingest limits in EncoderConfiguration/utils.js */
const MAX_BITRATE_BASIC_KBPS = 3500;
const MAX_BITRATE_STANDARD_KBPS = 8500;

const RES_720 = { width: 1280, height: 720 };
const RES_1080 = { width: 1920, height: 1080 };

/**
 * @param {object} options
 * @param {string} options.channelType - REACT_APP_CHANNEL_TYPE (BASIC | STANDARD | …)
 * @param {'landscape'|'portrait'} [options.orientation]
 * @param {string} [options.qualityEnv] - REACT_APP_WEB_BROADCAST_QUALITY: `720` | `1080`
 */
export function buildWebBroadcastStreamConfig({
  channelType,
  orientation = 'landscape',
  qualityEnv
}) {
  const preset =
    BROADCAST_STREAM_CONFIG_PRESETS[channelType]?.[orientation] ??
    BROADCAST_STREAM_CONFIG_PRESETS[CHANNEL_TYPE.BASIC][orientation];

  const cfg = { ...preset };
  const quality = qualityEnv === '1080' ? '1080' : '720';
  const isStandard = channelType === CHANNEL_TYPE.STANDARD;

  if (quality === '1080') {
    cfg.maxResolution = { ...RES_1080 };
    cfg.maxBitrate = isStandard
      ? MAX_BITRATE_STANDARD_KBPS
      : MAX_BITRATE_BASIC_KBPS;
  } else {
    cfg.maxResolution = { ...RES_720 };
    if (isStandard) cfg.maxBitrate = MAX_BITRATE_STANDARD_KBPS;
  }

  return cfg;
}

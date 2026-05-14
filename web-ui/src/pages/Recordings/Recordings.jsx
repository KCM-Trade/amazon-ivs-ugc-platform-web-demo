import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { Play } from '../../assets/icons';
import { channelsAPI } from '../../api';
import { app as $appContent } from '../../content';
import PageLayout from '../ChannelDirectory/PageLayout';
import withVerticalScroller from '../../components/withVerticalScroller';
import usePlayer from '../../hooks/usePlayer';
import { clsm } from '../../utils';
import Button from '../../components/Button';

const $replay = $appContent.replay_library;

const formatWhen = (iso) => {
  if (!iso) return '';

  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return iso;
  }
};

const RecordingPlayer = ({ playbackUrl }) => {
  const {
    videoRef,
    hasError,
    isLoading,
    isPaused,
    pause,
    play,
    qualities,
    selectedQualityName,
    updateQuality,
    updateVolume,
    volumeLevel,
    canvasRef,
    shouldBlurPlayer,
    isBlurReady
  } = usePlayer({
    isLive: false,
    isVod: true,
    playbackUrl,
    ingestConfiguration: undefined,
    isBlurEnabled: false
  });

  return (
    <div className={clsm(['w-full', 'max-w-4xl', 'space-y-3'])}>
      <div
        className={clsm([
          'relative',
          'w-full',
          'aspect-video',
          'rounded',
          'overflow-hidden',
          'bg-black'
        ])}
      >
        {shouldBlurPlayer && isBlurReady && (
          <canvas
            ref={canvasRef}
            className={clsm([
              'absolute',
              'inset-0',
              'h-full',
              'w-full',
              'pointer-events-none'
            ])}
          />
        )}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions may be embedded in IVS HLS; no sidecar VTT */}
        <video
          ref={videoRef}
          className={clsm(['relative', 'z-10', 'h-full', 'w-full'])}
          playsInline
          muted={false}
        />
        {(isLoading || hasError) && (
          <div
            className={clsm([
              'absolute',
              'inset-0',
              'z-20',
              'flex',
              'items-center',
              'justify-center',
              'bg-black/70',
              'text-white',
              'text-sm'
            ])}
          >
            {hasError ? 'Playback error' : 'Loading…'}
          </div>
        )}
      </div>
      <div
        className={clsm([
          'flex',
          'flex-wrap',
          'gap-2',
          'items-center',
          'justify-between'
        ])}
      >
        <Button
          variant="secondary"
          type="button"
          onClick={() => (isPaused ? play() : pause())}
        >
          {isPaused ? 'Play' : 'Pause'}
        </Button>
        {qualities.filter((q) => q.name !== 'Auto').length > 1 && (
          <label
            className={clsm(['flex', 'items-center', 'gap-2', 'text-sm', 'dark:text-white'])}
          >
            Quality
            <select
              className={clsm([
                'rounded',
                'border',
                'border-lightMode-gray',
                'dark:bg-darkMode-gray-medium',
                'dark:text-white',
                'px-2',
                'py-1'
              ])}
              value={selectedQualityName}
              onChange={(e) => updateQuality(e.target.value)}
            >
              {qualities.map((q) => (
                <option key={q.name} value={q.name}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label
          className={clsm(['flex', 'items-center', 'gap-2', 'text-sm', 'dark:text-white'])}
        >
          Volume
          <input
            type="range"
            min={0}
            max={100}
            value={volumeLevel}
            onChange={(e) => updateVolume(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
};

RecordingPlayer.propTypes = {
  playbackUrl: PropTypes.string.isRequired
};

const Recordings = () => {
  const [recordings, setRecordings] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [isBusy, setIsBusy] = useState(true);
  const [activeUrl, setActiveUrl] = useState('');
  const [activeLabel, setActiveLabel] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsBusy(true);
      setLoadError(null);

      const { result, error } = await channelsAPI.getChannelRecordings();

      if (cancelled) return;

      if (error) {
        setLoadError($replay.load_error);
        setRecordings([]);
      } else {
        setRecordings(result?.recordings || []);
      }

      setIsBusy(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageLayout>
      <div className={clsm(['w-full', 'max-w-4xl', 'space-y-6', 'pb-24'])}>
        <div className={clsm(['space-y-1'])}>
          <h1 className={clsm(['text-xl', 'font-semibold', 'dark:text-white'])}>
            {$replay.title}
          </h1>
          <p className={clsm(['text-sm', 'dark:text-gray-400', 'text-gray-600'])}>
            {$replay.hint}
          </p>
        </div>

        {!isBusy && loadError && (
          <p className={clsm(['text-darkMode-red-lighter', 'text-sm'])}>{loadError}</p>
        )}

        {!isBusy && !loadError && recordings.length === 0 && (
          <p className={clsm(['text-sm', 'dark:text-gray-300'])}>{$replay.empty}</p>
        )}

        {isBusy && <p className={clsm(['text-sm', 'dark:text-gray-400'])}>Loading…</p>}

        {!isBusy && recordings.length > 0 && (
          <ul className={clsm(['space-y-2', 'flex', 'flex-col'])}>
            {recordings.map((row) => {
              const label = `${formatWhen(row.startTime) || row.streamId}`;

              return (
                <li key={row.streamId}>
                  <Button
                    type="button"
                    variant="secondary"
                    className={clsm([
                      '!justify-start',
                      'w-full',
                      'gap-3',
                      'text-left'
                    ])}
                    onClick={() => {
                      setActiveUrl(row.playbackUrl);
                      setActiveLabel(label || row.streamId);
                    }}
                  >
                    <Play />
                    <span className={clsm(['flex-1', 'truncate'])}>{label}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {activeUrl ? (
          <div className={clsm(['space-y-2'])}>
            <p className={clsm(['text-sm', 'font-medium', 'dark:text-white'])}>
              {activeLabel}
            </p>
            <RecordingPlayer key={activeUrl} playbackUrl={activeUrl} />
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
};

export default withVerticalScroller(Recordings);

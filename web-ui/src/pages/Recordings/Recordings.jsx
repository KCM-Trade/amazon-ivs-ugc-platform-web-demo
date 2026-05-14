import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import {
  FullScreen,
  FullScreenExit,
  Play
} from '../../assets/icons';
import { channelsAPI } from '../../api';
import { app as $appContent } from '../../content';
import PageLayout from '../ChannelDirectory/PageLayout';
import withVerticalScroller from '../../components/withVerticalScroller';
import usePlayer from '../../hooks/usePlayer';
import { VOLUME_MAX, VOLUME_MIN } from '../../constants';
import { clsm, isiOS } from '../../utils';
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
  const fullscreenContainerRef = useRef(null);
  const iosFullscreenPollRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const {
    videoRef,
    hasError,
    isLoading,
    isPaused,
    pause,
    play,
    playerRef,
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

  const stopIosFullscreenPoll = useCallback(() => {
    if (iosFullscreenPollRef.current) {
      clearInterval(iosFullscreenPollRef.current);
      iosFullscreenPollRef.current = null;
    }
  }, []);

  const syncStateAfterIosNativeFullscreen = useCallback(() => {
    const inst = playerRef.current;

    try {
      if (!inst) return;

      if (inst.isPaused()) pause();
      else play();

      if (inst.isMuted()) updateVolume(VOLUME_MIN);
      else updateVolume(VOLUME_MAX);
    } catch {
      //
    }
  }, [pause, play, playerRef, updateVolume]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const root = fullscreenContainerRef.current;

      if (!root) return;

      const active =
        document.fullscreenElement ?? document.webkitFullscreenElement;

      setIsFullscreen(active === root);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        onFullscreenChange
      );
      stopIosFullscreenPoll();
    };
  }, [stopIosFullscreenPoll]);

  useEffect(
    () => () => stopIosFullscreenPoll(),
    [playbackUrl, stopIosFullscreenPoll]
  );

  const exitElementFullscreen = useCallback(async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }, []);

  const enterElementFullscreen = useCallback(async () => {
    const target = fullscreenContainerRef.current;

    if (!target) return;

    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (isiOS()) {
        const videoEl = videoRef.current;

        if (!videoEl?.webkitEnterFullscreen) return;

        if (videoEl.webkitDisplayingFullscreen) return;

        stopIosFullscreenPoll();
        videoEl.webkitEnterFullscreen();
        setIsFullscreen(true);
        iosFullscreenPollRef.current = setInterval(() => {
          if (!videoRef.current?.webkitDisplayingFullscreen) {
            stopIosFullscreenPoll();
            setIsFullscreen(false);
            syncStateAfterIosNativeFullscreen();
          }
        }, 150);

        return;
      }

      if (isFullscreen) await exitElementFullscreen();
      else await enterElementFullscreen();
    } catch {
      //
    }
  }, [
    enterElementFullscreen,
    exitElementFullscreen,
    isFullscreen,
    stopIosFullscreenPoll,
    syncStateAfterIosNativeFullscreen,
    videoRef
  ]);

  const desktopElementFullscreen = isFullscreen && !isiOS();

  const fsVideoShell = clsm([
    'relative',
    'w-full',
    'rounded',
    'overflow-hidden',
    'bg-black',
    'aspect-video',
    desktopElementFullscreen && [
      'aspect-auto',
      'flex',
      'flex-1',
      'min-h-0',
      'items-center',
      'justify-center',
      'rounded-none'
    ]
  ]);

  const fsVideoEl = clsm([
    'relative',
    'z-10',
    desktopElementFullscreen
      ? 'h-auto max-h-[min(calc(100dvh-8rem),100vw)] w-full object-contain'
      : 'h-full w-full'
  ]);

  return (
    <div
      ref={fullscreenContainerRef}
      className={clsm([
        'w-full',
        'max-w-4xl',
        'space-y-3',
        'rounded-lg',
        desktopElementFullscreen && [
            'flex',
            'h-[100dvh]',
            'max-h-screen',
            'min-h-[50vh]',
            'max-w-none',
            'flex-col',
            'bg-black',
            'p-4',
            'rounded-none'
          ]
      ])}
    >
      <div className={fsVideoShell}>
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
          className={fsVideoEl}
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
        <Button
          variant="secondary"
          type="button"
          onClick={toggleFullscreen}
          disabled={isiOS() && isFullscreen}
          aria-pressed={desktopElementFullscreen}
          ariaLabel={
            isiOS()
              ? $replay.enter_fullscreen
              : desktopElementFullscreen
                ? $replay.exit_fullscreen
                : $replay.enter_fullscreen
          }
          className={clsm([
            'inline-flex',
            'items-center',
            'justify-center',
            'gap-2'
          ])}
        >
          {!isiOS() && desktopElementFullscreen ? (
            <FullScreenExit />
          ) : (
            <FullScreen />
          )}
          <span>
            {isiOS()
              ? $replay.enter_fullscreen
              : desktopElementFullscreen
                ? $replay.exit_fullscreen
                : $replay.enter_fullscreen}
          </span>
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

import React, { useEffect, useState, useRef, SyntheticEvent, useCallback } from 'react';
import i18n from 'i18next';
import { useTranslation, initReactI18next } from 'react-i18next';
import {
  FaUndoAlt,
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeDown,
  FaVolumeOff,
  FaVolumeMute,
  FaArrowLeft,
  FaExpand,
  FaStepForward,
  FaClone,
  FaCompress,
  FaRedoAlt,
  FaForward,
  FaBackward,
  FaExternalLinkAlt,
} from 'react-icons/fa';
import { FiX } from 'react-icons/fi';
import {
  Loading,
  StandByInfo,
  VideoPreLoading,
  Container,
  Controls,
  VolumeControl,
  ItemPlaybackRate,
  IconPlayBackRate,
  IconPlaylist,
  IconPiP,
  IconNext,
  ItemNext,
  ItemPlaylist,
  PreviewImage,
  ProgressBarContainer,
  OperationOverlay,
  AutoplayOverlay,
  VolumeOverlay,
  VideoElement,
} from './styles.ts';
import translations from './i18n/index.ts';

// Constants for localStorage keys
const VOLUME_STORAGE_KEY = 'netflix-player-volume';
const MUTED_STORAGE_KEY = 'netflix-player-muted';

// Helper functions for localStorage
const getStoredVolume = (): number => {
  try {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 100;
  } catch {
    return 100;
  }
};

const getStoredMuted = (): boolean => {
  try {
    const stored = localStorage.getItem(MUTED_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
};

const setStoredVolume = (volume: number): void => {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, volume.toString());
  } catch {
    // Silently handle localStorage errors
  }
};

const setStoredMuted = (muted: boolean): void => {
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, muted.toString());
  } catch {
    // Silently handle localStorage errors
  }
};

i18n.use(initReactI18next).init({
  resources: translations,
  lng: 'en',
  fallbackLng: 'en',

  interpolation: {
    escapeValue: false,
  },
});

export enum LanguagesPlayer {
  en = 'en',
  pt = 'pt',
}

export interface IDataNext {
  title: string;
  description?: string;
}

export interface IItemReproduction {
  percent?: number;
  id: number | string;
  playing: boolean;
  name: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface IProps {
  title?: string | boolean;
  subTitle?: string | boolean;
  titleMedia?: string | boolean;
  extraInfoMedia?: string | boolean;
  playerLanguage?: LanguagesPlayer;
  fullPlayer?: boolean;
  backButton?: () => void;
  src: string;
  autoPlay?: boolean;
  onCanPlay?: () => void;
  onTimeUpdate?: (e: SyntheticEvent<HTMLVideoElement, Event>) => void;
  onLoadedMetadata?: (e: SyntheticEvent<HTMLVideoElement, Event>) => void;
  onEnded?: () => void;
  onErrorVideo?: (errorInfo?: any) => void;
  onNextClick?: () => void;
  onClickItemListReproduction?: (id: string | number, playing: boolean) => void;
  onCrossClick?: () => void;
  primaryColor?: string;
  secondaryColor?: string;
  startPosition?: number;
  playbackRateEnable?: boolean;
  fontFamily?: string;
  playbackRateStart?: number;
  playbackRateOptions?: string[];
  autoControlCloseEnabled?: boolean;
  overlayEnabled?: boolean;
  dataNext?: IDataNext;
  reproductionList?: IItemReproduction[];
  disablePreview?: boolean;
  disableBufferPreview?: boolean;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}

export default function ReactNetflixPlayer({
  title = false,
  subTitle = false,
  titleMedia = false,
  extraInfoMedia = false,
  playerLanguage = LanguagesPlayer.en,

  fullPlayer = true,
  backButton = undefined,

  src,
  autoPlay = false,

  onCanPlay = undefined,
  onTimeUpdate = undefined,
  onLoadedMetadata = undefined,
  onEnded = undefined,
  onErrorVideo = undefined,
  onNextClick = undefined,
  onClickItemListReproduction = undefined,
  onCrossClick = () => {},
  startPosition = 0,

  dataNext = {} as IDataNext,
  reproductionList = [],
  playbackRateEnable = true,
  overlayEnabled = true,
  autoControlCloseEnabled = true,

  primaryColor = '#03dffc',
  secondaryColor = '#ffffff',
  fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",

  playbackRateOptions = ['0.25', '0.5', '0.75', 'Normal', '1.25', '1.5', '2'],
  playbackRateStart = 1,
  disablePreview = true,
  disableBufferPreview = false,
  videoRef,
}: IProps) {
  const videoComponent = useRef<null | HTMLVideoElement>(null);
  const progressInputRef = useRef<HTMLInputElement | null>(null);

  const timerRef = useRef<null | NodeJS.Timeout>(null);
  const timerBuffer = useRef<null | NodeJS.Timeout>(null);
  const playerElement = useRef<null | HTMLDivElement>(null);
  const playlistRef = useRef<null | HTMLDivElement>(null);

  const [videoReady, setVideoReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [end, setEnd] = useState(false);
  const [controlBackEnd, setControlBackEnd] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [volume, setVolume] = useState(getStoredVolume());
  const [muted, setMuted] = useState(getStoredMuted());
  const [error, setError] = useState<boolean | string>(false);
  const [waitingBuffer, setWaitingBuffer] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<string | number>(playbackRateStart);
  const [started, setStarted] = useState(false);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const volumeOverlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showControlVolume, setShowControlVolume] = useState(false);
  const [showDataNext, setShowDataNext] = useState(false);
  const [showPlaybackRate, setShowPlaybackRate] = useState(false);
  const [showReproductionList, setShowReproductionList] = useState(false);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const [operation, setOperation] = useState<{ icon: JSX.Element; text: string } | null>(null);
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [requiresInteraction, setRequiresInteraction] = useState(autoPlay);
  const [isPiPMode, setIsPiPMode] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);

  const { t } = useTranslation();

  const formatTime = (totalSeconds: number): string => {
    const d = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = d % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };

  const timeUpdateRef = useRef<number>(0);
  const bufferedUpdateRef = useRef<number>(0);


  const timeUpdate = useCallback((e: SyntheticEvent<HTMLVideoElement, Event>) => {
  const target = e.target as HTMLVideoElement;
  const currentTime = target.currentTime;
  const duration = target.duration;

  // Store current time for sync checks
  timeUpdateRef.current = Date.now();

  // Only update states when necessary to prevent excessive re-renders
  const actuallyPlaying = !target.paused;
  if (playing !== actuallyPlaying) {
    setPlaying(actuallyPlaying);
  }

  // Handle buffering state efficiently
  if (waitingBuffer) {
    setWaitingBuffer(false);
  }

  // Clear and reset buffer timeout
  if (timerBuffer.current) {
    clearTimeout(timerBuffer.current);
  }
  timerBuffer.current = setTimeout(() => setWaitingBuffer(true), 1200);

  // Call external callback
  if (onTimeUpdate) {
    onTimeUpdate(e);
  }

  // Update progress input value directly
  if (progressInputRef.current) {
    progressInputRef.current.value = currentTime.toString();
  }

  // Throttled buffered progress update
  if (!disableBufferPreview) {
    const now = Date.now();
    if (now - bufferedUpdateRef.current > 1500) {
      bufferedUpdateRef.current = now;
      
      try {
        const buffered = target.buffered;
        let endBuffer = 0;
        
        for (let i = 0; i < buffered.length; i++) {
          const start = buffered.start(i);
          const end = buffered.end(i);
          
          if (currentTime >= start && currentTime <= end) {
            endBuffer = Math.max(endBuffer, end);
          }
        }
        
        if (duration > 0 && endBuffer > 0) {
          const bufferPercentage = (endBuffer / duration) * 100;
          setBufferedProgress(bufferPercentage);
        }
      } catch (error) {
        // Silently handle buffered range errors
      }
    }
  }

  // Update progress state only when significant change (reduce re-renders)
  const progressDiff = Math.abs(currentTime - progress);
  if (progressDiff > 0.5 || currentTime === 0) {
    setProgress(currentTime);
  }

  // Reset overlay states efficiently
  if (showInfo || end) {
    setShowInfo(false);
    setEnd(false);
  }
}, [playing, waitingBuffer, onTimeUpdate, disableBufferPreview, progress, showInfo, end]);

  const goToPosition = (position: number) => {
    const video = videoComponent.current;
    if (!video) return;
    video.currentTime = position;
    setProgress(position);
  };

  const showOperationOverlay = (icon: JSX.Element, text: string) => {
    setOperation({ icon, text });
    if (operationTimeoutRef.current) {
      clearTimeout(operationTimeoutRef.current);
    }
    operationTimeoutRef.current = setTimeout(() => {
      setOperation(null);
    }, 1000);
  };

  const togglePlayPause = async () => {
    const video = videoComponent.current;
    if (!video) return;

    try {
      if (video.paused) {
        await video.play();
        setRequiresInteraction(false);
        showOperationOverlay(<FaPlay />, 'Play');
      } else {
        video.pause();
        showOperationOverlay(<FaPause />, 'Pause');
      }
    } catch (error) {
      console.log("Play/pause failed:", error);
      if (error.name === 'NotAllowedError') {
        setRequiresInteraction(true);
        setPlaying(false);
      }
    }
  };

  const onEndedFunction = () => {
    if (videoComponent.current) {
      if (+startPosition === +videoComponent.current.duration && !controlBackEnd) {
        setControlBackEnd(true);
        videoComponent.current.currentTime = videoComponent.current.duration - 30;
        if (autoPlay) {
          setPlaying(true);
          videoComponent.current.play();
        } else {
          setPlaying(false);
        }
      } else {
        setEnd(true);
        setPlaying(false);

        if (onEnded) {
          onEnded();
        }
      }
    }
  };

  const seekBySeconds = (seconds: number) => {
    const video = videoComponent.current;
    if (!video) return;
    const current = video.currentTime;
    const total = video.duration;
    let newTime: number;

    if (seconds > 0) {
      newTime = current + seconds >= total - 2 
        ? total - 1 
        : current + seconds;
      showOperationOverlay(<FaForward />, `+${seconds}s`);
    } else {
      newTime = current + seconds <= 0 
        ? 0 
        : current + seconds;
      showOperationOverlay(<FaBackward />, `${seconds}s`);
    }

    video.currentTime = newTime;
    setProgress(newTime);
  };

  const startVideo = () => {
    if (videoComponent.current) {
      try {
        setDuration(videoComponent.current.duration);
        setVideoReady(true);

        const video = videoComponent.current;
        
        const handlePlay = () => {
          setPlaying(true);
          showOperationOverlay(<FaPlay />, 'Play');
        }
        const handlePause = () => {
          setPlaying(false);
          showOperationOverlay(<FaPause />, 'Pause');
        }
        
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        
        video.addEventListener('loadstart', () => {
          video.removeEventListener('play', handlePlay);
          video.removeEventListener('pause', handlePause);
        });

        if (!started) {
          setStarted(true);

          if (startPosition > 0) {
            videoComponent.current.currentTime = startPosition;
            setProgress(startPosition);
          }

          videoComponent.current.muted = muted;

          if (autoPlay) {
            const playPromise = videoComponent.current.play();
            
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  setRequiresInteraction(false);
                })
                .catch((error) => {
                  console.log("Autoplay prevented:", error);
                  setRequiresInteraction(true);
                  setPlaying(false);
                });
            }
          } else {
            setRequiresInteraction(true);
            setPlaying(false);
          }
        }

        if (onCanPlay) {
          onCanPlay();
        }
      } catch (err) {
        setPlaying(false);
        setRequiresInteraction(true);
      }
    }
  };

  const errorVideo = (e?: any) => {
    const videoEl = videoComponent.current;
    const mediaError = videoEl?.error;
    const errorInfo = {
      code: mediaError?.code,
      message: mediaError?.message,
      networkState: videoEl?.networkState,
      readyState: videoEl?.readyState,
      currentSrc: videoEl?.currentSrc,
      currentTime: videoEl?.currentTime,
      duration: videoEl?.duration,
      buffered: videoEl?.buffered?.length ? Array.from({ length: videoEl.buffered.length }, (_, i) => ({
        start: videoEl.buffered.start(i),
        end: videoEl.buffered.end(i),
      })) : [],
    };
    console.error('[NetflixPlayer] Video error details:', errorInfo);
    console.error('[NetflixPlayer] MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED');
    if (onErrorVideo) {
      onErrorVideo(errorInfo);
    }
    setError(t('playError', { lng: playerLanguage }));
  };

  const updateVolume = useCallback((value: number, showOverlay = true) => {
    const video = videoComponent.current;
    if (!video) return;

    setVolume(value);
    video.volume = value / 100;
    
    if (showOverlay) {
      setShowVolumeOverlay(true);
      if (volumeOverlayTimeoutRef.current) clearTimeout(volumeOverlayTimeoutRef.current);
      volumeOverlayTimeoutRef.current = setTimeout(() => setShowVolumeOverlay(false), 2000);
    }

    setStoredVolume(value);
  }, []);

  const setMutedAction = useCallback((value: boolean) => {
    const video = videoComponent.current;
    if (!video) return;

    setMuted(value);
    setShowControlVolume(false);
    video.muted = value;
    
    const icon = value ? <FaVolumeMute /> : 
                 volume >= 60 ? <FaVolumeUp /> : 
                 volume >= 10 ? <FaVolumeDown /> : <FaVolumeOff />;
    
    showOperationOverlay(icon, value ? 'Muted' : 'Unmuted');
    
    if (volumeOverlayTimeoutRef.current) clearTimeout(volumeOverlayTimeoutRef.current);
    volumeOverlayTimeoutRef.current = setTimeout(() => setShowVolumeOverlay(false), 2000);

    setStoredMuted(value);
  }, [volume, showOperationOverlay]);

  const renderVolumeOverlay = () => {
    if (!showVolumeOverlay) return null;

    const isMuted = volume === 0;
    const volumeIcon = isMuted ? <FaVolumeMute /> :
      volume >= 60 ? <FaVolumeUp /> :
      volume >= 10 ? <FaVolumeDown /> :
      volume > 0 ? <FaVolumeOff /> : <FaVolumeMute />;

    const volumeText = isMuted ? 'Muted' : `${Math.round(volume)}%`;

    return (
      <VolumeOverlay $primaryColor={primaryColor}>
        <div className="volume-icon">
          {volumeIcon}
        </div>
        
        <span>{volumeText}</span>
        
        {!isMuted && (
          <div className="volume-bar">
            <div 
              className="volume-fill"
              style={{ width: `${volume}%` }}
            />
          </div>
        )}
      </VolumeOverlay>
    );
  };

  const togglePictureInPicture = useCallback(async () => {
    const video = videoComponent.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPMode(false);
        showOperationOverlay(<FaExternalLinkAlt />, t('exitPictureInPicture'));
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPiPMode(true);
        showOperationOverlay(<FaExternalLinkAlt />, t('pictureInPicture'));
      }
    } catch (error) {
      console.error('Picture-in-Picture toggle failed:', error);
      showOperationOverlay(<FaExternalLinkAlt />, t('pipNotSupported'));
    }
  }, [showOperationOverlay]);

  // Check PiP support
  useEffect(() => {
    if (videoComponent.current && 'requestPictureInPicture' in videoComponent.current) {
      setIsPiPSupported(true);
    }
  }, [videoComponent.current]);

  // Listen for PiP events
  useEffect(() => {
    const video = videoComponent.current;
    if (!video) return;

    const handleEnterPiP = () => {
      setIsPiPMode(true);
    };

    const handleLeavePiP = () => {
      setIsPiPMode(false);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [videoComponent.current]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerBuffer.current) clearTimeout(timerBuffer.current);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (volumeOverlayTimeoutRef.current) clearTimeout(volumeOverlayTimeoutRef.current);
      if (operationTimeoutRef.current) clearTimeout(operationTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (videoRef && videoComponent.current) {
      videoRef.current = videoComponent.current;
    }
  }, [videoRef]);

  const videoRefCallback = (element: HTMLVideoElement | null) => {
    videoComponent.current = element;
    if (videoRef) {
      videoRef.current = element;
    }
  };

  const scrollToSelected = () => {
    const element = playlistRef.current;
    if (!element) return;
    
    const selected = element.getElementsByClassName('selected')[0] as HTMLElement;
    if (!selected) return;
    
    const position = selected.offsetTop;
    const height = selected.offsetHeight;
    element.scrollTop = position - height * 2;
  };

  const updatePlaybackRate = (value: string | number) => {
    const video = videoComponent.current;
    if (!video) return;

    const speed = value === 'Normal' ? 1 : +value;
    video.playbackRate = speed;
    setPlaybackRate(speed);
  };

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleProgressBarHover = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    if (!duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = duration * percent;
    const now = Date.now();
    const throttleInterval = 16; // Consistent throttling regardless of preview setting
    if (now - (handleProgressBarHover as any).lastUpdate < throttleInterval) return;
    (handleProgressBarHover as any).lastUpdate = now;

    setHoverTime(time);
    setHoverPosition({ x: e.clientX, y: rect.top });
  }, [duration]);



  useEffect(() => {
    if (showReproductionList) {
      scrollToSelected();
    }
  }, [showReproductionList]);

  useEffect(() => {
    if (src && videoComponent.current) {
      videoComponent.current.currentTime = startPosition;
      
      setProgress(startPosition);
      setDuration(0);
      setVideoReady(false);
      setError(false);
      setShowReproductionList(false);
      setShowDataNext(false);
      setPlaying(autoPlay);
      setBufferedProgress(0);
      
      setHoverTime(null);
      setHoverPosition(null);
    }
  }, [src, startPosition]);

  useEffect(() => {
    updateFullscreenState();
  }, [document.fullscreenElement]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    if (target.tagName === 'VIDEO' || 
        target === playerElement.current ||
        (!target.closest('.controls') && 
         !target.closest('line-reproduction') && 
         !target.closest('button') && 
         !target.closest('[class*="Item"]') && 
         !target.closest('.progress-bar'))) {
      e.preventDefault();
      e.stopPropagation();
      
      togglePlayPause();
    }
  };

  const handleShowControls = useCallback(() => {
    setShowControls(true);
    setShowInfo(false);

    if (timerRef.current) clearTimeout(timerRef.current);
    
    const hideControls = () => {
      if (!autoControlCloseEnabled) {
        setShowInfo(true);
        return;
      }
      setShowControls(false);
      if (!playing) setShowInfo(true);
    };

    timerRef.current = setTimeout(hideControls, 2000);
  }, [autoControlCloseEnabled, playing]);

  const mouseMoveTimeoutRef = useRef<number>(0);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - mouseMoveTimeoutRef.current > 150) {
      mouseMoveTimeoutRef.current = now;
      handleShowControls();
    }
  }, [handleShowControls]);


  const updateFullscreenState = () => {
    setFullScreen(!!document.fullscreenElement);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (playerElement.current?.requestFullscreen) {
        await playerElement.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const activeElement = document.activeElement as HTMLElement;
    const isInputFocused = activeElement?.tagName === 'INPUT' || 
                          activeElement?.tagName === 'TEXTAREA' || 
                          activeElement?.contentEditable === 'true';

    if (isInputFocused) return;

    const video = videoComponent.current;
    if (!video) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayPause();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        seekBySeconds(-5);
        handleShowControls();
        break;

      case 'ArrowRight':
        e.preventDefault();
        seekBySeconds(5);
        handleShowControls();
        break;

      case 'ArrowUp':
        e.preventDefault();
        updateVolume(Math.min(100, Math.round(video.volume * 100) + 5));
        handleShowControls();
        break;

      case 'ArrowDown':
        e.preventDefault();
        updateVolume(Math.max(0, Math.round(video.volume * 100) - 5));
        handleShowControls();
        break;

      case 'KeyM':
        e.preventDefault();
        setMutedAction(!video.muted);
        handleShowControls();
        break;

      case 'KeyF':
        e.preventDefault();
        toggleFullscreen();
        showOperationOverlay(
          document.fullscreenElement ? <FaCompress /> : <FaExpand />, 
          document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen'
        );
        break;

      case 'KeyP':
        e.preventDefault();
        if (isPiPSupported) {
          togglePictureInPicture();
        }
        break;
    }
  }, [togglePlayPause, seekBySeconds, updateVolume, setMutedAction, toggleFullscreen, handleShowControls, showOperationOverlay, isPiPSupported, togglePictureInPicture]);

  function renderAutoplayOverlay() {
    if (!requiresInteraction) return null;

    return (
      <AutoplayOverlay
        $primaryColor={primaryColor}
        $secondaryColor={secondaryColor}
        $show={requiresInteraction}
        onClick={(e) => {
          e.stopPropagation();
          togglePlayPause();
        }}
      >
        {(title || titleMedia || subTitle) && (
          <section className="section-main">
            <h3 className="subtitle">
              {autoPlay ? 
                (t('autoplayBlocked', { lng: playerLanguage }) || 'Autoplay was blocked') :
                (t('youAreWatching', { lng: playerLanguage }) || 'You are watching')
              }
            </h3>
            
            <h1 className="title">
              {title || titleMedia}
            </h1>
            
            {subTitle && (
              <h2 className="subtitle-text">
                {subTitle}
              </h2>
            )}
          </section>
        )}

        <div className="play-button-container">
          <div className="play-button">
            <FaPlay className="play-icon" />
          </div>
          
          <div className="play-text">
            {autoPlay ? 
              (t('clickToPlay', { lng: playerLanguage }) || 'Click to Play') :
              (t('clickToStart', { lng: playerLanguage }) || 'Click to Start')
            }
          </div>
        </div>

        {!(title || titleMedia || subTitle) && (
          <section className="center-section">
            <h1 className="center-title">
              {autoPlay ? 
                (t('clickToPlay', { lng: playerLanguage }) || 'Click to Play') :
                (t('readyToWatch', { lng: playerLanguage }) || 'Ready to Watch')
              }
            </h1>

            <p className="center-text">
              {autoPlay ? 
                (t('autoplayBlocked', { lng: playerLanguage }) || 'Your browser prevented autoplay') :
                (t('clickToStart', { lng: playerLanguage }) || 'Click anywhere to start watching')
              }
            </p>
          </section>
        )}

        <footer className="footer-section">
          {autoPlay ? 
            (t('autoplayPrevented', { lng: playerLanguage }) || 'Autoplay prevented') :
            (t('clickToPlay', { lng: playerLanguage }) || 'Click to play')
          }
        </footer>
      </AutoplayOverlay>
    );
  }

  function renderLoading() {
    return (
      <Loading color={primaryColor}>
        <div>
          <div />
          <div />
          <div />
        </div>
      </Loading>
    );
  }

  function renderInfoVideo() {
  if (!overlayEnabled) return null;
  
  return (
    <StandByInfo
      $primaryColor={primaryColor}
      $secondaryColor={secondaryColor}
      $show={showInfo === true && videoReady === true && playing === false}
    >
      {(title || subTitle) && (
        <section className="center">
          <h3 className="text">{t('youAreWatching', { lng: playerLanguage })}</h3>
          <h1 className="title">{title}</h1>
          <h2 className="sub-title">{subTitle}</h2>
        </section>
      )}
      <footer>{t('paused', { lng: playerLanguage })}</footer>
    </StandByInfo>
  );
}

  function renderCloseVideo() {
    return (
      <VideoPreLoading
        $backgroundColorHoverButtonError="#f78b28"
        $colorHoverButtonError="#ddd"
        $colorButtonError="#ddd"
        $backgroundColorButtonError="#333"
        $colorTitle="#fff"
        $colorSubTitle="#fff"
        $colorIcon="#fff"
        $show={videoReady === false || (videoReady === true && !!error)}
        $showError={!!error}
      >
        {(title || subTitle) && (
          <header>
            <div>
              <h1>{title}</h1>
              <h2>{subTitle}</h2>
            </div>
            <FiX onClick={onCrossClick} />
          </header>
        )}

        <section>
          {error && (
            <div>
              <h1>{error}</h1>
            </div>
          )}
        </section>
      </VideoPreLoading>
    );
  }

  const playingRef = useRef(playing);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const handleFullscreenChange = () => updateFullscreenState();
    
    document.addEventListener('keydown', handleKeyDown, { passive: false });
    document.addEventListener('fullscreenchange', handleFullscreenChange, { passive: true });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [handleKeyDown]);
  const requiresInteractionRef = useRef(requiresInteraction);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    requiresInteractionRef.current = requiresInteraction;
  }, [requiresInteraction]);

  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (videoComponent.current && videoReady && !requiresInteraction) {
        const actuallyPlaying = !videoComponent.current.paused;
        if (Math.abs(Date.now() - timeUpdateRef.current) > 3000 && playing !== actuallyPlaying) {
          setPlaying(actuallyPlaying);
        }
      }
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [playing, videoReady, requiresInteraction]);

  useEffect(() => {
    if (disableBufferPreview) {
      setBufferedProgress(0);
    }
  }, [disableBufferPreview]);

  return (
    <Container
      onMouseMove={handleMouseMove}
      ref={playerElement}
      onDoubleClick={toggleFullscreen}
      onClick={handleContainerClick}
      $fullPlayer={fullPlayer}
      $hideVideo={!!error}
      $fontFamily={fontFamily}
    >
      {(videoReady === false || (waitingBuffer === true && playing === true)) && !error && !end && renderLoading()}

      {renderInfoVideo()}

      {renderCloseVideo()}

      {(videoReady === true) && renderAutoplayOverlay()}

      {overlayEnabled && renderVolumeOverlay()}

      {operation && (
        <OperationOverlay>
          {operation.icon}
          <span>{operation.text}</span>
        </OperationOverlay>
      )}

      <VideoElement
        ref={videoRefCallback}
        src={src}
        controls={false}
        onCanPlay={() => startVideo()}
        onTimeUpdate={timeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onError={(e: any) => errorVideo(e)}
        onEnded={onEndedFunction}
        muted={muted}
        crossOrigin="anonymous"
      />

      <Controls
        $show={showControls === true && videoReady === true && error === false}
        $primaryColor={primaryColor}
        $progressVideo={(progress * 100) / duration}
      >
        {backButton && (
          <div className="back">
            <div onClick={backButton} style={{ cursor: 'pointer' }}>
              <FaArrowLeft />
              <span>{t('goBack', { lng: playerLanguage })}</span>
            </div>
          </div>
        )}

        {hoverPosition && hoverTime !== null && !showPlaybackRate && !showDataNext && !showReproductionList && (
          <PreviewImage
            style={{
              left: `${hoverPosition.x - (disablePreview ? 25 : 70)}px`,
              bottom: `${window.innerHeight - hoverPosition.y + 10}px`,
              maxHeight: `${hoverPosition.y - 20}px`,
            }}
          >
            {!disablePreview ? (
              <>
                <div className="loading-fallback">
                  <span>No preview</span>
                </div>
                <div className="time-indicator">{formatTime(hoverTime)}</div>
              </>
            ) : (
              <div className="time-indicator">{formatTime(hoverTime)}</div>
            )}
          </PreviewImage>
        )}

        {showControlVolume !== true && !showDataNext && !showReproductionList && (
          <div 
            className="line-reproduction" 
            onMouseLeave={() => {
              setHoverTime(null);
              setHoverPosition(null);
            }}
          >
            <span>{formatTime(progress)}</span>
            
            <ProgressBarContainer
              $primaryColor={primaryColor}
              $bufferedProgress={disableBufferPreview ? 0 : bufferedProgress}
              $progressVideo={(progress * 100) / duration}
            >
              {!disableBufferPreview && <div className="buffered-bar" />}
              
              <div className="played-bar" />
              
              <input
                ref={progressInputRef}
                type="range"
                defaultValue={progress.toString()}
                className="progress-bar"
                max={duration}
                onChange={e => goToPosition(+e.target.value)}
                onMouseMove={handleProgressBarHover}
                onMouseEnter={handleProgressBarHover}
                onMouseLeave={() => {
                  setHoverTime(null);
                  setHoverPosition(null);
                }}
                title=""
              />
            </ProgressBarContainer>
            
            <span>{formatTime(duration - progress)}</span>
          </div>
        )}

        {videoReady === true && (
          <div className="controls">
            <div className="start">
              <div className="item-control">
                {(!playing || (videoComponent.current && videoComponent.current.paused)) && <FaPlay onClick={togglePlayPause} />}
                {(playing && videoComponent.current && !videoComponent.current.paused) && <FaPause onClick={togglePlayPause} />}
              </div>

              <div className="item-control">
                <FaUndoAlt onClick={() => seekBySeconds(-5)} />
              </div>

              <div className="item-control">
                <FaRedoAlt onClick={() => seekBySeconds(5)} />
              </div>

              {muted === false && (
                <VolumeControl
                  onMouseLeave={() => setShowControlVolume(false)}
                  className="item-control"
                  $primaryColor={primaryColor}
                  $percentVolume={volume}
                >
                  {showControlVolume === true && (
                    <div className="volume-control">
                      <div className="box-connector" />
                      <div className="box">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={volume}
                          onChange={e => updateVolume(+e.target.value)}
                          title=""
                        />
                      </div>
                    </div>
                  )}

                  {volume >= 60 && (
                    <FaVolumeUp onMouseEnter={() => setShowControlVolume(true)} onClick={() => setMutedAction(true)} />
                  )}

                  {volume < 60 && volume >= 10 && (
                    <FaVolumeDown onMouseEnter={() => setShowControlVolume(true)} onClick={() => setMutedAction(true)} />
                  )}

                  {volume < 10 && volume > 0 && (
                    <FaVolumeOff onMouseEnter={() => setShowControlVolume(true)} onClick={() => setMutedAction(true)} />
                  )}

                  {volume <= 0 && (
                    <FaVolumeMute onMouseEnter={() => setShowControlVolume(true)} onClick={() => updateVolume(50)} />
                  )}
                </VolumeControl>
              )}

              {muted === true && (
                <div className="item-control">
                  <FaVolumeMute onClick={() => setMutedAction(false)} />
                </div>
              )}
            </div>

            <div className="center">
              <div className="item-control info-video">
                <span className="info-first">{titleMedia}</span>
                <span className="info-second">{extraInfoMedia}</span>
              </div>
            </div>

            <div className="end">
              {!!playbackRateEnable && (
                <div 
                  className="item-control playback-rate-container"
                  style={{
                    '--show-menu': showPlaybackRate ? '1' : '0',
                    position: 'relative',
                    zIndex: showPlaybackRate ? 2000 : 'auto'
                  } as React.CSSProperties}
                  onMouseEnter={() => setShowPlaybackRate(true)}
                  onMouseLeave={() => setShowPlaybackRate(false)}
                >
                  {showPlaybackRate === true && (
                    <ItemPlaybackRate $primaryColor={primaryColor}>
                      <div>
                        <div className="title">{t('speeds', { lng: playerLanguage })}</div>
                        {playbackRateOptions.map(item => {
                          const isSelected = (+item === +playbackRate || (item === 'Normal' && +playbackRate === 1));
                          return (
                            <div 
                              className={`item ${isSelected ? 'selected' : ''}`} 
                              onClick={() => updatePlaybackRate(item)} 
                              key={item}
                            >
                              {isSelected && (
                                <svg 
                                  width="16" 
                                  height="16" 
                                  viewBox="0 0 24 24" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  strokeWidth="3" 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20,6 9,17 4,12"></polyline>
                                </svg>
                              )}
                              <div className="bold">{item === 'Normal' ? item : `${item}x`}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="box-connector" />
                    </ItemPlaybackRate>
                  )}
                  <IconPlayBackRate $primaryColor={primaryColor} className="playbackRate">
                    <span className='playbackRate_span'>
                      {playbackRate === 'Normal' ? '1' : `${playbackRate}`}
                      <small>x</small>
                    </span>
                  </IconPlayBackRate>
                </div>
              )}

              {onNextClick && (
                <div className="item-control" onMouseLeave={() => setShowDataNext(false)}>
                  {showDataNext === true && dataNext.title && (
                    <ItemNext>
                      <div>
                        <div className="title">{t('nextEpisode', { lng: playerLanguage })}</div>
                        <div className="item">
                          <div className="bold">{dataNext.title}</div>
                          {dataNext.description && <div>{dataNext.description}</div>}
                        </div>
                      </div>
                      <div className="box-connector" />
                    </ItemNext>
                  )}
                  <IconNext $primaryColor={primaryColor}>
                    <FaStepForward onClick={onNextClick} onMouseEnter={() => setShowDataNext(true)} />
                  </IconNext>
                </div>
              )}

              <div className="item-control" onMouseLeave={() => setShowReproductionList(false)}>
                {showReproductionList && (
                  <ItemPlaylist>
                    <div>
                      <div className="title">
                        {reproductionList.length > 0 && reproductionList[0].seasonNumber 
                          ? `Season ${reproductionList[0].seasonNumber}` 
                          : t('playlist', { lng: playerLanguage })
                        }
                      </div>
                      <div ref={playlistRef} className="list-playback scroll-clean-player">
                        {reproductionList.map((item, index) => (
                          <div
                            key={item.id}
                            className={`item-playback ${item.playing && 'selected'}`}
                            onClick={() =>
                              onClickItemListReproduction && onClickItemListReproduction(item.id, item.playing)
                            }
                          >
                            <div className="bold">
                              <span style={{ marginRight: 15 }}>
                                {item.episodeNumber ? `E${item.episodeNumber}` : index + 1}
                              </span>
                              {item.name}
                            </div>
                            {item.percent && <div className="percent" />}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="box-connector" />
                  </ItemPlaylist>
                )}
                {reproductionList && reproductionList.length > 1 && (
                  <IconPlaylist $primaryColor={primaryColor}>
                    <FaClone onMouseEnter={() => setShowReproductionList(true)} />
                  </IconPlaylist>
                )}
              </div>

              {isPiPSupported && (
                <div className="item-control">  
                  <IconPiP $primaryColor={primaryColor} $isActive={isPiPMode} onClick={togglePictureInPicture}>
                  <FaExternalLinkAlt 
                    title={t('pipTooltip')}
                  />
                  </IconPiP>
                </div>
              )}

              <div className="item-control">
                {fullScreen === false && <FaExpand onClick={toggleFullscreen} />}
                {fullScreen === true && <FaCompress onClick={toggleFullscreen} />}
              </div>
            </div>
          </div>
        )}
      </Controls>
    </Container>
  );
}

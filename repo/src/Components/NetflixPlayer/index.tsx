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
  FaCog,
  FaClone,
  FaCompress,
  FaRedoAlt,
  FaForward,
  FaBackward,
} from 'react-icons/fa';
import { FiCheck, FiX } from 'react-icons/fi';
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
  IconNext,
  ItemNext,
  ItemPlaylist,
  ItemListQuality,
  PreviewImage,
  ProgressBarContainer,
  OperationOverlay,
} from './styles.ts';
import translations from './i18n/index.ts';

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

export interface IQualities {
  prefix: string;
  name: string;
  playing: boolean;
  id: string | number;
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
  onErrorVideo?: () => void;
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
  qualities?: IQualities[];
  onChangeQuality?: (quality: string | number) => void;
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
  qualities = [],
  onChangeQuality = [] as any,
  playbackRateEnable = true,
  overlayEnabled = true,
  autoControlCloseEnabled = true,

  primaryColor = '#03dffc',
  secondaryColor = '#ffffff',
  fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",

  playbackRateOptions = ['0.25', '0.5', '0.75', 'Normal', '1.25', '1.5', '2'],
  playbackRateStart = 1,
  disablePreview = false,
  disableBufferPreview = false,
  videoRef,
}: IProps) {
  const videoComponent = useRef<null | HTMLVideoElement>(null);
  const timerRef = useRef<null | NodeJS.Timeout>(null);
  const timerBuffer = useRef<null | NodeJS.Timeout>(null);
  const playerElement = useRef<null | HTMLDivElement>(null);
  const playlistRef = useRef<null | HTMLDivElement>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCache = useRef<Map<number, string>>(new Map());
  const maxCacheSize = 50;

  const [videoReady, setVideoReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [end, setEnd] = useState(false);
  const [controlBackEnd, setControlBackEnd] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
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
  const [showQuality, setShowQuality] = useState(false);
  const [showDataNext, setShowDataNext] = useState(false);
  const [showPlaybackRate, setShowPlaybackRate] = useState(false);
  const [showReproductionList, setShowReproductionList] = useState(false);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const [operation, setOperation] = useState<{ icon: JSX.Element; text: string } | null>(null);
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [requiresInteraction, setRequiresInteraction] = useState(autoPlay);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const { t } = useTranslation();

  const secondsToHms = (totalSeconds: number): string => {
    const d = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = d % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${m}:${pad(s)}`;
  };

  const timeUpdateRef = useRef<number>(0);
  const bufferedUpdateRef = useRef<number>(0);
  const lastProgressState = useRef<{playing: boolean, buffered: number, progress: number}>({
    playing: false, 
    buffered: 0, 
    progress: 0
  });
  
  const timeUpdate = useCallback((e: SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement;
    const currentTime = target.currentTime;
    const duration = target.duration;
    const now = Date.now();

    if (now - timeUpdateRef.current < 111) return;
    timeUpdateRef.current = now;

    const updates: (() => void)[] = [];

    if (Math.abs(currentTime - lastProgressState.current.progress) > 1) {
      lastProgressState.current.progress = currentTime;
      updates.push(() => setProgress(currentTime));
    }

    const isPlaying = !target.paused;
    if (lastProgressState.current.playing !== isPlaying) {
      lastProgressState.current.playing = isPlaying;
      updates.push(() => setPlaying(isPlaying));
    }
    if (!disableBufferPreview && now - bufferedUpdateRef.current > 10000) {
      bufferedUpdateRef.current = now;
      if (target.buffered.length > 0) {
        const bufferedEnd = target.buffered.end(target.buffered.length - 1);
        const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
        if (Math.abs(bufferedPercent - lastProgressState.current.buffered) > 10) {
          lastProgressState.current.buffered = bufferedPercent;
          updates.push(() => setBufferedProgress(bufferedPercent));
        }
      }
    }

    updates.forEach(update => update());
    if (waitingBuffer) {
      setWaitingBuffer(false);
    }

    if (timerBuffer.current) {
      clearTimeout(timerBuffer.current);
    }
    timerBuffer.current = setTimeout(() => setWaitingBuffer(true), 8000);

    if (onTimeUpdate && now - timeUpdateRef.current > 2000) {
      onTimeUpdate(e);
    }

    if (Math.floor(currentTime) % 15 === 0) {
      setShowInfo(false);
      setEnd(false);
    }
  }, [waitingBuffer, onTimeUpdate, disableBufferPreview]);

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
        setHasUserInteracted(true);
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

  const forcePlay = async () => {
    const video = videoComponent.current;
    if (!video) return;

    try {
      await video.play();
      setPlaying(true);
      setRequiresInteraction(false);
      setHasUserInteracted(true);
    } catch (error) {
      console.error("Force play failed:", error);
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
                  setHasUserInteracted(true);
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

  const errorVideo = () => {
    if (onErrorVideo) {
      onErrorVideo();
    }
    setError(t('playError', { lng: playerLanguage }));
  };

  const updateVolume = (value: number, showOverlay = true) => {
    const video = videoComponent.current;
    if (!video) return;

    setVolume(value);
    video.volume = value / 100;
    
    if (showOverlay) {
      setShowVolumeOverlay(true);
      
      if (volumeOverlayTimeoutRef.current) {
        clearTimeout(volumeOverlayTimeoutRef.current);
      }
      
      volumeOverlayTimeoutRef.current = setTimeout(() => {
        setShowVolumeOverlay(false);
      }, 2000);
    }
  };

  const setMutedAction = (value: boolean) => {
    if (videoComponent.current) {
      setMuted(value);
      setShowControlVolume(false);
      videoComponent.current.muted = value;
      
      showOperationOverlay(
        value ? <FaVolumeMute /> : (volume >= 60 ? <FaVolumeUp /> : volume >= 10 ? <FaVolumeDown /> : <FaVolumeOff />),
        value ? 'Muted' : 'Unmuted'
      );
      
      if (volumeOverlayTimeoutRef.current) {
        clearTimeout(volumeOverlayTimeoutRef.current);
      }
      
      volumeOverlayTimeoutRef.current = setTimeout(() => {
        setShowVolumeOverlay(false);
      }, 2000);
    }
  };

  const renderVolumeOverlay = () => {
    if (!showVolumeOverlay) return null;

    const isMuted = volume === 0;
    const volumeIcon = isMuted ? <FaVolumeMute /> :
      volume >= 60 ? <FaVolumeUp /> :
      volume >= 10 ? <FaVolumeDown /> :
      volume > 0 ? <FaVolumeOff /> : <FaVolumeMute />;

    const volumeText = isMuted ? 'Muted' : `${Math.round(volume)}%`;

    return (
      <div
        style={{
          position: 'absolute',
          top: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 2000,
          fontSize: '14px',
          fontWeight: '500',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          animation: 'fadeInOut 2s ease-in-out',
          minWidth: '120px',
          justifyContent: 'center',
          verticalAlign: 'center'
        }}
      >
        <style>
          {`
            @keyframes fadeInOut {
              0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
              10%, 90% { opacity: 1; transform: translateX(-50%) translateY(0); }
              100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            }
          `}
        </style>
        
        <div style={{ fontSize: '16px', color: primaryColor, alignItems: 'center', alignSelf: 'center' }}>
          {volumeIcon}
        </div>
        
        <span>{volumeText}</span>
        
        {!isMuted && (
          <div
            style={{
              width: '60px',
              height: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${volume}%`,
                height: '100%',
                backgroundColor: primaryColor,
                borderRadius: '2px',
                transition: 'width 0.2s ease'
              }}
            />
          </div>
        )}
      </div>
    );
  };

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

  const [isCapturing, setIsCapturing] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleProgressBarHover = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!duration) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalWidth = rect.width;
    const percent = Math.max(0, Math.min(1, x / totalWidth));
    const time = duration * percent;
    const now = Date.now();

    const throttleInterval = disablePreview ? 16 : 50;
    if (now - (handleProgressBarHover as any).lastUpdate < throttleInterval) return;
    (handleProgressBarHover as any).lastUpdate = now;

    requestAnimationFrame(() => {
      setHoverTime(time);
      setHoverPosition({ x: e.clientX, y: rect.top });
    });

    if (!disablePreview) {
      const roundedTime = Math.floor(time);
      const cachedFrame = frameCache.current.get(roundedTime);
      
      if (cachedFrame) {
        setPreviewImage(cachedFrame);
        setLoadingPreview(false);
        return;
      }

      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      setPreviewImage(null);
      setLoadingPreview(true);

      hoverTimeoutRef.current = setTimeout(() => {
        if (!isCapturing) {
          captureFrameAtTime(time);
        }
      }, 500);
    }
  };

  const captureFrameAtTime = (time: number) => {
    if (disablePreview || !previewVideoRef.current || !previewCanvasRef.current || isCapturing) {
      return;
    }

    const roundedTime = Math.floor(time / 5) * 5;
    
    const cachedFrame = frameCache.current.get(roundedTime);
    if (cachedFrame && hoverTime !== null) {
      setPreviewImage(cachedFrame);
      setLoadingPreview(false);
      return;
    }

    if (hoverTime === null || Math.abs((hoverTime || 0) - roundedTime) > 8) {
      return;
    }

    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    
    setIsCapturing(true);
    
    video.removeEventListener('seeked', video.onseeked as any);
    
    const captureTimeout = setTimeout(() => {
      setIsCapturing(false);
      setLoadingPreview(false);
      video.removeEventListener('seeked', video.onseeked as any);
    }, 300);
    
    const handleSeeked = () => {
      clearTimeout(captureTimeout);
      
      if (hoverTime === null || Math.abs((hoverTime || 0) - roundedTime) > 8) {
        setIsCapturing(false);
        setLoadingPreview(false);
        return;
      }
      
      const context = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: false
      });
      
      if (context) {
        try {
          context.drawImage(video, 0, 0, 120, 68);
          const dataURL = canvas.toDataURL('image/jpeg', 0.6);
          
          if (frameCache.current.size >= maxCacheSize) {
            const firstKey = frameCache.current.keys().next().value;
            frameCache.current.delete(firstKey);
          }
          
          frameCache.current.set(roundedTime, dataURL);
          
          if (Math.abs((hoverTime || 0) - roundedTime) < 8) {
            setPreviewImage(dataURL);
          }
        } catch (error) {
          console.warn('Failed to capture frame:', error);
        }
      }
      
      setIsCapturing(false);
      setLoadingPreview(false);
      video.removeEventListener('seeked', handleSeeked);
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.currentTime = time;
  };

  useEffect(() => {
    if (showReproductionList) {
      scrollToSelected();
    }
  }, [showReproductionList]);

  useEffect(() => {
    if (src && videoComponent.current) {
      frameCache.current.clear();
      
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
      setPreviewImage(null);
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
      
      if (requiresInteraction) {
        forcePlay();
      } else {
        togglePlayPause();
      }
    }
  };

  const controlScreenTimeOut = () => {
    if (!autoControlCloseEnabled) {
      setShowInfo(true);
      return;
    }

    setShowControls(false);
    if (!playing) {
      setShowInfo(true);
    }
  };

  const hoverScreen = () => {
    setShowControls(true);
    setShowInfo(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(controlScreenTimeOut, 2000);
  };

  const mouseMoveTimeoutRef = useRef<number>(0);
  
  const throttledHoverScreen = (e: React.MouseEvent) => {
    setShowControls(true);
    setShowInfo(false);
    
    const now = Date.now();
    if (now - mouseMoveTimeoutRef.current > 150) {
      mouseMoveTimeoutRef.current = now;
      hoverScreen();
    }
  };


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

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.contentEditable === 'true'
      );

      if (isInputFocused) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (videoComponent.current) {
            if (videoComponent.current.paused) {
              if (requiresInteractionRef.current) {
                forcePlay();
              } else {
                togglePlayPause();
              }
            } else {
              togglePlayPause();
            }
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          seekBySeconds(-5);
          hoverScreen();
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          seekBySeconds(5);
          hoverScreen();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          if (videoComponent.current) {
            const currentVolume = Math.round(videoComponent.current.volume * 100);
            const newVolume = Math.min(100, currentVolume + 5);
            updateVolume(newVolume);
          }
          hoverScreen();
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          if (videoComponent.current) {
            const currentVolume = Math.round(videoComponent.current.volume * 100);
            const newVolume = Math.max(0, currentVolume - 5);
            updateVolume(newVolume);
          }
          hoverScreen();
          break;
          
        case 'KeyM':
          e.preventDefault();
          if (videoComponent.current) {
            const currentMuted = videoComponent.current.muted;
            setMutedAction(!currentMuted);
          }
          hoverScreen();
          break;
          
        case 'KeyF':
          e.preventDefault();
          console.log("pressed f");
          
          toggleFullscreen();
          showOperationOverlay(document.fullscreenElement ? <FaCompress /> : <FaExpand />, document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen');
          break;
      }
    };

    const handleFullscreenChange = () => {
      updateFullscreenState();
    };

    document.addEventListener('keydown', keyHandler, { passive: false });
    document.addEventListener('fullscreenchange', handleFullscreenChange, { passive: true });
    
    return () => {
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  function renderAutoplayOverlay() {
    if (!requiresInteraction) return null;

    return (
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '0 50px',
          zIndex: 1000,
          cursor: 'pointer',
          transition: 'all 0.5s ease-out',
          opacity: 1
        }}
        onClick={forcePlay}
      >
        {(title || titleMedia || subTitle) && (
          <section style={{
            margin: 'auto 0',
            paddingTop: '100px',
            paddingLeft: '100px',
            color: '#ffffff'
          }}>
            <h3 style={{
              color: primaryColor,
              fontSize: '1.1em',
              marginBottom: '5px',
              fontWeight: 'normal'
            }}>
              {autoPlay ? 
                (t('autoplayBlocked', { lng: playerLanguage }) || 'Autoplay was blocked') :
                (t('youAreWatching', { lng: playerLanguage }) || 'You are watching')
              }
            </h3>
            
            <h1 style={{
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '3em',
              margin: '10px 0',
              lineHeight: '1.1'
            }}>
              {title || titleMedia}
            </h1>
            
            {subTitle && (
              <h2 style={{
                color: secondaryColor,
                fontSize: '20px',
                fontWeight: 'normal',
                marginTop: '-5px',
                opacity: '0.9'
              }}>
                {subTitle}
              </h2>
            )}
          </section>
        )}

        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              backgroundColor: primaryColor,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: `0 4px 20px ${primaryColor}66`,
              marginBottom: '20px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = `0 6px 25px ${primaryColor}99`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = `0 4px 20px ${primaryColor}66`;
            }}
            onClick={(e) => {
              e.stopPropagation();
              forcePlay();
            }}
          >
            <FaPlay style={{ 
              fontSize: '45px', 
              marginLeft: '8px', 
              color: 'white' 
            }} />
          </div>
          
          <div style={{
            color: '#ffffff',
            fontSize: '1.2em',
            textAlign: 'center',
            fontWeight: '500'
          }}>
            {autoPlay ? 
              (t('clickToPlay', { lng: playerLanguage }) || 'Click to Play') :
              (t('clickToStart', { lng: playerLanguage }) || 'Click to Start')
            }
          </div>
        </div>

        {!(title || titleMedia || subTitle) && (
          <section style={{
            margin: 'auto',
            textAlign: 'center',
            color: '#ffffff'
          }}>
            <h1 style={{
              fontSize: '2.5em',
              marginBottom: '20px',
              fontWeight: 'bold'
            }}>
              {autoPlay ? 
                (t('clickToPlay', { lng: playerLanguage }) || 'Click to Play') :
                (t('readyToWatch', { lng: playerLanguage }) || 'Ready to Watch')
              }
            </h1>

            <p style={{
              fontSize: '1.2em',
              opacity: '0.8',
              margin: '0'
            }}>
              {autoPlay ? 
                (t('autoplayBlocked', { lng: playerLanguage }) || 'Your browser prevented autoplay') :
                (t('clickToStart', { lng: playerLanguage }) || 'Click anywhere to start watching')
              }
            </p>
          </section>
        )}

        <footer style={{
          marginTop: 'auto',
          marginBottom: '50px',
          marginLeft: 'auto',
          textTransform: 'uppercase',
          color: secondaryColor,
          fontSize: '0.9em',
          opacity: '0.7'
        }}>
          {autoPlay ? 
            (t('autoplayPrevented', { lng: playerLanguage }) || 'Autoplay prevented') :
            (t('clickToPlay', { lng: playerLanguage }) || 'Click to play')
          }
        </footer>
      </div>
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
              {qualities.length > 1 && (
                <div>
                  <p>{t('tryAccessingOtherQuality', { lng: playerLanguage })}</p>
                  <div className="links-error">
                    {qualities.map(item => (
                      <div onClick={() => onChangeQuality(item.id)}>
                        {item.prefix && <span>HD</span>}
                        <span>{item.name}</span>
                        {item.playing && <FiX />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </VideoPreLoading>
    );
  }

  const playingRef = useRef(playing);
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
      onMouseMove={throttledHoverScreen}
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

      <video
        ref={videoRefCallback}
        src={src}
        controls={false}
        onCanPlay={() => startVideo()}
        onTimeUpdate={timeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onError={errorVideo}
        onEnded={onEndedFunction}
        muted={muted}
        style={{ 
          cursor: 'pointer',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
        crossOrigin="anonymous"
      />

      {!disablePreview && (
        <>
          <video
            ref={previewVideoRef}
            src={src}
            style={{ display: 'none' }}
            muted
            preload="auto"
            crossOrigin="anonymous"
          />
          <canvas
            ref={previewCanvasRef}
            width={120}
            height={68}
            style={{ display: 'none' }}
          />
        </>
      )}

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

        {hoverPosition && hoverTime !== null && !showPlaybackRate && !showQuality && !showDataNext && !showReproductionList && (
          <PreviewImage
            style={{
              left: `${hoverPosition.x - (disablePreview ? 25 : 70)}px`,
              bottom: `${window.innerHeight - hoverPosition.y + 10}px`,
              maxHeight: `${hoverPosition.y - 20}px`,
            }}
          >
            {!disablePreview ? (
              <>
                {previewImage ? (
                  <img src={previewImage} alt="Preview" />
                ) : (
                  <div className="loading-fallback">
                    {loadingPreview ? (
                      <>
                        <div className="loading-spinner">
                          <div></div>
                          <div></div>
                          <div></div>
                        </div>
                        <span>Loading...</span>
                      </>
                    ) : (
                      <span>No preview</span>
                    )}
                  </div>
                )}
                <div className="time-indicator">{secondsToHms(hoverTime)}</div>
              </>
            ) : (
              <div className="time-indicator">{secondsToHms(hoverTime)}</div>
            )}
          </PreviewImage>
        )}

        {showControlVolume !== true && showQuality !== true && !showDataNext && !showReproductionList && (
          <div 
            className="line-reproduction" 
            onMouseLeave={() => {
              setPreviewImage(null);
              setHoverTime(null);
              setHoverPosition(null);
            }}
          >
            <span>{secondsToHms(progress)}</span>
            
            <ProgressBarContainer
              $primaryColor={primaryColor}
              $bufferedProgress={disableBufferPreview ? 0 : bufferedProgress}
              $progressVideo={(progress * 100) / duration}
            >
              {!disableBufferPreview && <div className="buffered-bar" />}
              
              <div className="played-bar" />
              
              <input
                type="range"
                value={progress}
                className="progress-bar"
                max={duration}
                onChange={e => goToPosition(+e.target.value)}
                onMouseMove={handleProgressBarHover}
                onMouseEnter={handleProgressBarHover}
                onMouseLeave={() => {
                  setHoverTime(null);
                  setHoverPosition(null);
                  setPreviewImage(null);
                  setLoadingPreview(false);
                }}
                title=""
              />
            </ProgressBarContainer>
            
            <span>{secondsToHms(duration - progress)}</span>
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
                        <div className="item" onClick={onNextClick}>
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

              {qualities && qualities.length > 1 && (
                <div className="item-control" onMouseLeave={() => setShowQuality(false)}>
                  {showQuality === true && (
                    <ItemListQuality>
                      <div>
                        {qualities &&
                          qualities.map(item => (
                            <div
                              onClick={() => {
                                setShowQuality(false);
                                onChangeQuality(item.id);
                              }}
                            >
                              {item.prefix && <span>HD</span>}

                              <span>{item.name}</span>
                              {item.playing && <FiCheck />}
                            </div>
                          ))}
                      </div>
                      <div className="box-connector" />
                    </ItemListQuality>
                  )}

                  <FaCog onMouseEnter={() => setShowQuality(true)} />
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

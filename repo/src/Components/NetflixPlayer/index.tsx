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
  ItemNext,
  ItemPlaylist,
  ItemListQuality,
  PreviewImage,
  ProgressBarContainer,
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
  disablePreview?: boolean; // Add this new prop
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

  // Styles
  primaryColor = '#03dffc',
  secondaryColor = '#ffffff',
  fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",

  playbackRateOptions = ['0.25', '0.5', '0.75', 'Normal', '1.25', '1.5', '2'],
  playbackRateStart = 1,
  disablePreview = false,
}: IProps) {
  // References
  const videoComponent = useRef<null | HTMLVideoElement>(null);
  const timerRef = useRef<null | NodeJS.Timeout>(null);
  const timerBuffer = useRef<null | NodeJS.Timeout>(null);
  const playerElement = useRef<null | HTMLDivElement>(null);
  const playlistRef = useRef<null | HTMLDivElement>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCache = useRef<Map<number, string>>(new Map());

  // States
  const [videoReady, setVideoReady] = useState(false);
  const [playing, setPlaying] = useState(false); // Start as false instead of true
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [end, setEnd] = useState(false);
  const [controlBackEnd, setControlBackEnd] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false); // Start unmuted
  const [error, setError] = useState(false);
  const [waitingBuffer, setWaitingBuffer] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<string | number>(playbackRateStart);
  const [started, setStarted] = useState(false);

  const [showControlVolume, setShowControlVolume] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showDataNext, setShowDataNext] = useState(false);
  const [showPlaybackRate, setShowPlaybackRate] = useState(false);
  const [showReproductionList, setShowReproductionList] = useState(false);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Add the missing autoplay state variables
  const [requiresInteraction, setRequiresInteraction] = useState(autoPlay); // Set to true if autoPlay is requested
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const { t } = useTranslation();

  const secondsToHms = (d: number) => {
    d = Number(d);
    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    let s = Math.floor((d % 3600) % 60);
    let seconds = s.toString();

    if (s < 10) {
      seconds = `0${s}`;
    }

    if (h) {
      return `${h}:${m}:${seconds}`;
    }

    return `${m}:${seconds}`;
  };

  // Add this state with your other states
  const [bufferedProgress, setBufferedProgress] = useState(0);

  // Update the timeUpdate function to calculate buffered progress
  const timeUpdate = (e: SyntheticEvent<HTMLVideoElement, Event>) => {
    const currentSeekTime = Math.floor(e.currentTarget.currentTime);

    // Only capture frames if preview is enabled
    if (!disablePreview && currentSeekTime % 15 === 0 && !frameCache.current.has(currentSeekTime)) {
      captureFrameAtTime(currentSeekTime);
    }

    setShowInfo(false);
    setEnd(false);
    if (playing) {
      setPlaying(true);
    }

    if (waitingBuffer) {
      setWaitingBuffer(false);
    }

    if (timerBuffer.current) {
      clearTimeout(timerBuffer.current);
    }

    timerBuffer.current = setTimeout(() => setWaitingBuffer(true), 1000);

    if (onTimeUpdate) {
      onTimeUpdate(e);
    }

    const target = e.target as HTMLVideoElement;
    const currentTime = target.currentTime;
    const duration = target.duration;

    // Calculate buffered progress
    let bufferedEnd = 0;
    const lengthBuffer = target.buffered.length;

    for (let i = 0; i < lengthBuffer; i++) {
      const startCheck = target.buffered.start(i);
      const endCheck = target.buffered.end(i);

      // Find the buffered range that contains the current time
      if (currentTime >= startCheck && currentTime <= endCheck) {
        bufferedEnd = endCheck;
        break;
      }
      // Also check for buffered ranges ahead of current time
      if (startCheck > currentTime) {
        bufferedEnd = Math.max(bufferedEnd, endCheck);
      }
    }

    // Calculate buffered percentage
    const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
    setBufferedProgress(bufferedPercent);

    setProgress(target.currentTime);
  };

  const goToPosition = (position: number) => {
    if (videoComponent.current) {
      videoComponent.current.currentTime = position;
      setProgress(position);
    }
  };

  const play = () => {
    if (videoComponent.current) {
      const wasPlaying = !videoComponent.current.paused;
      
      if (wasPlaying) {
        videoComponent.current.pause();
        setPlaying(false);
      } else {
        // Attempt to play
        const playPromise = videoComponent.current.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setPlaying(true);
              setRequiresInteraction(false);
              setHasUserInteracted(true);
            })
            .catch((error) => {
              console.log("Autoplay prevented:", error);
              if (error.name === 'NotAllowedError') {
                // Show play button overlay for user interaction
                setRequiresInteraction(true);
                setPlaying(false);
              }
            });
        }
      }
    }
  };

  const forcePlay = () => {
    if (videoComponent.current) {
      const playPromise = videoComponent.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setPlaying(true);
            setRequiresInteraction(false);
            setHasUserInteracted(true);
          })
          .catch((error) => {
            console.error("Play failed:", error);
          });
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

  const nextSeconds = (seconds: number) => {
    if (videoComponent.current) {
      const current = videoComponent.current.currentTime;
      const total = videoComponent.current.duration;

      if (current + seconds >= total - 2) {
        videoComponent.current.currentTime = videoComponent.current.duration - 1;
        setProgress(videoComponent.current.duration - 1);
        return;
      }

      videoComponent.current.currentTime += seconds;
      setProgress(videoComponent.current.currentTime); // Remove the + seconds here
    }
  };

  const previousSeconds = (seconds: number) => {
    if (videoComponent.current) {
      const current = videoComponent.current.currentTime;

      if (current - seconds <= 0) {
        videoComponent.current.currentTime = 0;
        setProgress(0);
        return;
      }

      videoComponent.current.currentTime -= seconds;
      setProgress(videoComponent.current.currentTime); // Remove the - seconds here
    }
  };

  const startVideo = () => {
    if (videoComponent.current) {
      try {
        setDuration(videoComponent.current.duration);
        setVideoReady(true);

        if (!started) {
          setStarted(true);

          // Ensure video starts at the correct position
          if (startPosition > 0) {
            videoComponent.current.currentTime = startPosition;
            setProgress(startPosition);
          }

          // Don't auto-mute - let the overlay handle user interaction
          videoComponent.current.muted = muted;

          if (autoPlay) {
            // Try autoplay without muting first
            const playPromise = videoComponent.current.play();
            
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  setPlaying(true);
                  setRequiresInteraction(false);
                  setHasUserInteracted(true);
                })
                .catch((error) => {
                  console.log("Autoplay prevented:", error);
                  // Show overlay for user interaction instead of muting
                  setRequiresInteraction(true);
                  setPlaying(false);
                });
            }
          } else {
            // If autoPlay is false, show the overlay immediately
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

  // Add state for volume overlay
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const volumeOverlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setVolumeAction = (value: number) => {
    if (videoComponent.current) {
      setVolume(value);
      videoComponent.current.volume = value / 100;
      
      // Show volume overlay
      setShowVolumeOverlay(true);
      
      // Clear existing timeout
      if (volumeOverlayTimeoutRef.current) {
        clearTimeout(volumeOverlayTimeoutRef.current);
      }
      
      // Hide overlay after 2 seconds
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
      
      // Show volume overlay for mute/unmute
      setShowVolumeOverlay(true);
      
      // Clear existing timeout
      if (volumeOverlayTimeoutRef.current) {
        clearTimeout(volumeOverlayTimeoutRef.current);
      }
      
      // Hide overlay after 2 seconds
      volumeOverlayTimeoutRef.current = setTimeout(() => {
        setShowVolumeOverlay(false);
      }, 2000);
    }
  };

  // Add this function to render the volume overlay
  function renderVolumeOverlay() {
    if (!showVolumeOverlay) return null;

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
          justifyContent: 'center'
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
        
        {/* Volume icon */}
        <div style={{ fontSize: '16px', color: primaryColor }}>
          {muted ? (
            <FaVolumeMute />
          ) : volume >= 60 ? (
            <FaVolumeUp />
          ) : volume >= 10 ? (
            <FaVolumeDown />
          ) : volume > 0 ? (
            <FaVolumeOff />
          ) : (
            <FaVolumeMute />
          )}
        </div>
        
        {/* Volume text */}
        <span>
          {muted ? 'Muted' : `${Math.round(volume)}%`}
        </span>
        
        {/* Volume bar */}
        {!muted && (
          <div
            style={{
              width: '60px',
              height: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '2px',
              overflow: 'hidden'
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
  }

  // Clean up volume overlay timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timerBuffer.current) clearTimeout(timerBuffer.current);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (volumeOverlayTimeoutRef.current) clearTimeout(volumeOverlayTimeoutRef.current);
    };
  }, []);

  const scrollToSelected = () => {
    const element = playlistRef.current;
    if (element) {
      const selected = element.getElementsByClassName('selected')[0] as HTMLElement;
      const position = selected.offsetTop;
      const height = selected.offsetHeight;
      element.scrollTop = position - height * 2;
    }
  };

  const onChangePlayBackRate = (value: string | number) => {
    if (videoComponent.current) {
      const speed = value === 'Normal' ? 1 : +value;
      videoComponent.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const [isCapturing, setIsCapturing] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleProgressBarHover = (e: React.MouseEvent<HTMLInputElement>) => {
    // Always calculate hover time, even if preview is disabled
    if (!duration) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalWidth = rect.width;
    const percent = x / totalWidth;
    const time = duration * percent;

    setHoverTime(time);
    setHoverPosition({ x: e.clientX - rect.left, y: rect.top });

    // Only do frame capture if preview is enabled
    if (!disablePreview) {
      const roundedTime = Math.floor(time);

      // Clear previous timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      // Check cache first for immediate display
      const cachedFrame = frameCache.current.get(roundedTime);
      if (cachedFrame) {
        setPreviewImage(cachedFrame);
        setLoadingPreview(false);
        return;
      }

      // Show loading state immediately
      setPreviewImage(null);
      setLoadingPreview(true);

      // Debounce frame capture by 150ms
      hoverTimeoutRef.current = setTimeout(() => {
        if (!isCapturing) {
          captureFrameAtTime(time);
        }
      }, 150);
    }
  };

  const captureFrameAtTime = useCallback(
    (time: number) => {
      // Early return if preview is disabled
      if (disablePreview || !previewVideoRef.current || !previewCanvasRef.current || isCapturing) return;

      const roundedTime = Math.floor(time);
      
      // Check cache first
      const cachedFrame = frameCache.current.get(roundedTime);
      if (cachedFrame && hoverTime !== null) {
        setPreviewImage(cachedFrame);
        setLoadingPreview(false);
        return;
      }

      // Only proceed if we're still hovering
      if (hoverTime === null) return;

      const video = previewVideoRef.current;
      const canvas = previewCanvasRef.current;
      
      setIsCapturing(true);
      
      // Remove any existing event listener to prevent memory leaks
      video.onseeked = null;
      
      // Set a timeout to prevent hanging
      const captureTimeout = setTimeout(() => {
        setIsCapturing(false);
        setLoadingPreview(false);
        video.onseeked = null;
      }, 2000);
      
      video.onseeked = () => {
        clearTimeout(captureTimeout);
        
        // Double-check we're still hovering
        if (hoverTime === null) {
          setIsCapturing(false);
          setLoadingPreview(false);
          return;
        }
        
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Use lower quality for faster processing
          const dataURL = canvas.toDataURL('image/jpeg', 0.6);
          frameCache.current.set(roundedTime, dataURL);
          
          // Only set preview if we're still hovering at the same time
          if (Math.abs((hoverTime || 0) - roundedTime) < 1) {
            setPreviewImage(dataURL);
          }
        }
        
        setIsCapturing(false);
        setLoadingPreview(false);
        video.onseeked = null;
      };

      video.currentTime = time;
    },
    [hoverTime, isCapturing, disablePreview]
  );

  useEffect(() => {
    // Don't pre-load frames if preview is disabled
    if (disablePreview || !videoReady || !videoComponent.current) return;
    
    // Remove automatic frame pre-loading or make it very sparse
    // Only capture a few key frames
    const keyTimes = [0, duration * 0.25, duration * 0.5, duration * 0.75];
    keyTimes.forEach(time => {
      if (time < duration) {
        setTimeout(() => captureFrameAtTime(time), Math.random() * 1000);
      }
    });
  }, [videoReady, duration, disablePreview]);

  useEffect(() => {
    if (showReproductionList) {
      scrollToSelected();
    }
  }, [showReproductionList]);

  useEffect(() => {
    if (src && videoComponent.current) {
      // Clear the cache when video source changes
      frameCache.current.clear();
      
      // Set the video's initial position first
      videoComponent.current.currentTime = startPosition;
      
      // Set progress to match the startPosition (not always 0)
      setProgress(startPosition);
      setDuration(0);
      setVideoReady(false);
      setError(false);
      setShowReproductionList(false);
      setShowDataNext(false);
      setPlaying(autoPlay);
      setBufferedProgress(0);
      
      // Clear preview states
      setHoverTime(null);
      setPreviewImage(null);
      setHoverPosition(null);
    }
  }, [src, startPosition]); // Add startPosition as dependency

  useEffect(() => {
    setStateFullScreen();
  }, [document.fullscreenElement]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only trigger play/pause if we're not clicking on controls
    const target = e.target as HTMLElement;

    // Check if the click is on the video area (not on controls)
    if (target.tagName === 'VIDEO' || 
        target === playerElement.current ||
        (!target.closest('.controls') && 
         !target.closest('line-reproduction') && 
         !target.closest('button') && 
         !target.closest('[class*="Item"]') && 
         !target.closest('.progress-bar'))) {
      e.preventDefault();
      e.stopPropagation();
      
      // If requires interaction, force play on first click
      if (requiresInteraction) {
        forcePlay();
      } else {
        play();
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

    timerRef.current = setTimeout(controlScreenTimeOut, 3000);
  };

  const setStateFullScreen = () => {
    setFullScreen(!!document.fullscreenElement);
  };

  const enterFullScreen = () => {
    if (playerElement.current && playerElement.current.requestFullscreen) {
      playerElement.current.requestFullscreen();
    }
  };

  const exitFullScreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const chooseFullScreen = () => {
    if (fullScreen) {
      exitFullScreen();
    } else {
      enterFullScreen();
    }
  };

  // Consolidated keyboard handling in useEffect with proper dependency management
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.contentEditable === 'true'
      );

      if (isInputFocused) return; // Don't handle any keys when input is focused

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          // Use current state values directly from refs or DOM
          if (videoComponent.current) {
            if (videoComponent.current.paused) {
              if (requiresInteraction) {
                forcePlay();
              } else {
                videoComponent.current.play();
                setPlaying(true);
              }
            } else {
              videoComponent.current.pause();
              setPlaying(false);
            }
            hoverScreen();
          }
          break;
          
        case 'ArrowLeft':
          e.preventDefault();
          previousSeconds(5);
          hoverScreen();
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          nextSeconds(5);
          hoverScreen();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          if (videoComponent.current) {
            const currentVolume = Math.round(videoComponent.current.volume * 100);
            const newVolume = Math.min(100, currentVolume + 5);
            setVolumeAction(newVolume);
          }
          hoverScreen();
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          if (videoComponent.current) {
            const currentVolume = Math.round(videoComponent.current.volume * 100);
            const newVolume = Math.max(0, currentVolume - 5);
            setVolumeAction(newVolume);
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
          chooseFullScreen();
          break;
      }
    };

    const handleFullscreenChange = () => {
      setStateFullScreen();
    };

    // Add event listeners
    document.addEventListener('keydown', keyHandler, false);
    document.addEventListener('fullscreenchange', handleFullscreenChange, false);
    
    // Cleanup function
    return () => {
      document.removeEventListener('keydown', keyHandler, false);
      document.removeEventListener('fullscreenchange', handleFullscreenChange, false);
    };
  }, []); // Remove all dependencies to prevent constant re-creation

  // Simple autoplay overlay matching the pause overlay design
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
        {/* Header section - similar to pause overlay with text only */}
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

        {/* Centered play button overlay */}
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
              boxShadow: `0 4px 20px ${primaryColor}66`, // Use primaryColor here too
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
          
          {/* Click to Play text under the button */}
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

        {/* Simple centered version when no title/subtitle */}
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

        {/* Footer section - matching pause overlay */}
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
  // Only render when overlayEnabled is true
  if (!overlayEnabled) return null;
  
  return (
    <StandByInfo
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      show={showInfo === true && videoReady === true && playing === false}
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
        backgroundColorHoverButtonError="#f78b28"
        colorHoverButtonError="#ddd"
        colorButtonError="#ddd"
        backgroundColorButtonError="#333"
        colorTitle="#fff"
        colorSubTitle="#fff"
        colorIcon="#fff"
        show={videoReady === false || (videoReady === true && error)}
        showError={!!error}
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

  // Add refs for immediate state access if needed
  const playingRef = useRef(playing);
  const requiresInteractionRef = useRef(requiresInteraction);

  // Keep refs in sync with state
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    requiresInteractionRef.current = requiresInteraction;
  }, [requiresInteraction]);

  return (
    <Container
      onMouseMove={hoverScreen}
      ref={playerElement}
      onDoubleClick={chooseFullScreen}
      onClick={handleContainerClick}
      fullPlayer={fullPlayer}
      hideVideo={!!error}
      fontFamily={fontFamily}
    >
      {(videoReady === false || (waitingBuffer === true && playing === true)) && !error && !end && renderLoading()}

      {renderInfoVideo()}

      {renderCloseVideo()}

      {/* Render autoplay overlay if interaction is required */}
      {renderAutoplayOverlay()}

      {/* Render volume overlay */}
      {renderVolumeOverlay()}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoComponent}
        src={src}
        controls={false}
        onCanPlay={() => startVideo()}
        onTimeUpdate={timeUpdate}
        onError={errorVideo}
        onEnded={onEndedFunction}
        muted={muted} // Use the state variable - no longer hardcoded as true
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

      {/* Only render preview video and canvas if preview is enabled */}
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
            width={160}
            height={90}
            style={{ display: 'none' }}
          />
        </>
      )}

      <Controls
        show={showControls === true && videoReady === true && error === false}
        primaryColor={primaryColor}
        progressVideo={(progress * 100) / duration}
      >
        {backButton && (
          <div className="back">
            <div onClick={backButton} style={{ cursor: 'pointer' }}>
              <FaArrowLeft />
              <span>{t('goBack', { lng: playerLanguage })}</span>
            </div>
          </div>
        )}

        {/* Show preview with image if enabled, or just time indicator if disabled */}
        {hoverPosition && hoverTime !== null && (
          <PreviewImage
            style={{
              left: `${hoverPosition.x - 60}px`,
              bottom: '110px',
            }}
          >
            {!disablePreview ? (
              // Full preview with image when enabled
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
              // Only time indicator when preview is disabled
              <div className="time-indicator">{secondsToHms(hoverTime)}</div>
            )}
          </PreviewImage>
        )}

        {showControlVolume !== true && showQuality !== true && !showDataNext && !showReproductionList && (
          <div className="line-reproduction" onMouseLeave={() => {
            setPreviewImage(null);
            setHoverTime(null);
            setHoverPosition(null);
          }}>
            {/* Current time display */}
            <span>{secondsToHms(progress)}</span>
            
            <ProgressBarContainer
              primaryColor={primaryColor}
              bufferedProgress={bufferedProgress}
              progressVideo={(progress * 100) / duration}
            >
              {/* Buffered progress bar */}
              <div className="buffered-bar" />
              
              {/* Played progress bar */}
              <div className="played-bar" />
              
              {/* Interactive range input - always show hover events for time indicator */}
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
            
            {/* Remaining time display */}
            <span>{secondsToHms(duration - progress)}</span>
          </div>
        )}

        {videoReady === true && (
          <div className="controls">
            <div className="start">
              <div className="item-control">
                {!playing && <FaPlay onClick={play} />}
                {playing && <FaPause onClick={play} />}
              </div>

              <div className="item-control">
                <FaUndoAlt onClick={() => previousSeconds(5)} />
              </div>

              <div className="item-control">
                <FaRedoAlt onClick={() => nextSeconds(5)} />
              </div>

              {muted === false && (
                <VolumeControl
                  onMouseLeave={() => setShowControlVolume(false)}
                  className="item-control"
                  primaryColor={primaryColor}
                  percentVolume={volume}
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
                          onChange={e => setVolumeAction(+e.target.value)}
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
                    <FaVolumeMute onMouseEnter={() => setShowControlVolume(true)} onClick={() => setVolumeAction(0)} />
                  )}
                </VolumeControl>
              )}

              {muted === true && (
                <div className="item-control">
                  <FaVolumeMute onClick={() => setMutedAction(false)} />
                </div>
              )}

              <div className="item-control info-video">
                <span className="info-first">{titleMedia}</span>
                <span className="info-second">{extraInfoMedia}</span>
              </div>
            </div>

            <div className="end">
              {!!playbackRateEnable && (
                <div className="item-control" onMouseLeave={() => setShowPlaybackRate(false)}>
                  {showPlaybackRate === true && (
                    <ItemPlaybackRate>
                      <div>
                        <div className="title">{t('speeds', { lng: playerLanguage })}</div>
                        {playbackRateOptions.map(item => (
                          <div className="item" onClick={() => onChangePlayBackRate(item)}>
                            {(+item === +playbackRate || (item === 'Normal' && +playbackRate === 1)) && FiCheck({})}
                            <div className="bold">{item === 'Normal' ? item : `${item}x`}</div>
                          </div>
                        ))}
                      </div>
                      <div className="box-connector" />
                    </ItemPlaybackRate>
                  )}

                  <IconPlayBackRate className="playbackRate" onMouseEnter={() => setShowPlaybackRate(true)}>
                    <span>
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

                  <FaStepForward onClick={onNextClick} onMouseEnter={() => setShowDataNext(true)} />
                </div>
              )}

              <div className="item-control" onMouseLeave={() => setShowReproductionList(false)}>
                {showReproductionList && (
                  <ItemPlaylist>
                    <div>
                      <div className="title">{t('playlist', { lng: playerLanguage })}</div>
                      <div ref={playlistRef} className="list-playback scroll-clean-player">
                        {reproductionList.map((item, index) => (
                          <div
                            className={`item-playback ${item.playing && 'selected'}`}
                            onClick={() =>
                              onClickItemListReproduction && onClickItemListReproduction(item.id, item.playing)
                            }
                          >
                            <div className="bold">
                              <span style={{ marginRight: 15 }}>{index + 1}</span>
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
                  <FaClone onMouseEnter={() => setShowReproductionList(true)} />
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
                {fullScreen === false && <FaExpand onClick={enterFullScreen} />}
                {fullScreen === true && <FaCompress onClick={exitFullScreen} />}
              </div>
            </div>
          </div>
        )}
      </Controls>
    </Container>
  );
}

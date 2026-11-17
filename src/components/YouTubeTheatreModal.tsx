import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  Download,
  FastForward,
  Heart,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import {
  MovieEngagementSummary,
  MovieItem,
  MovieSeries,
} from '../types/cinema.ts';
import { isMovieInDeviceVault } from './DownloadMovieModal.tsx';
import {
  BrandedShareCard,
  buildMovieShareMessage,
  buildMovieShareUrl,
} from './ShareMovieModal.tsx';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeTheatreModalProps {
  movie: MovieItem;
  allMovies: MovieItem[];
  seriesList: MovieSeries[];
  userId: string;
  initialAutoPlay?: boolean;
  resumeSeconds?: number;
  inWatchlist: boolean;
  onClose: () => void;
  onSelectMovie: (movie: MovieItem, autoPlay?: boolean) => void;
  onToggleWatchlist: (movieId: string) => void;
  onProgressUpdate: (
    movieId: string,
    progressSeconds: number,
    durationSeconds: number
  ) => void;
  onPlaybackError: (
    movieId: string,
    status: 'unavailable' | 'embed_restricted'
  ) => void;
  onEngagementChanged?: () => void;
  onOpenDownload?: (movie: MovieItem) => void;
  onOpenOfflinePlayer?: (movie: MovieItem) => void;
}

export const YouTubeTheatreModal: React.FC<YouTubeTheatreModalProps> = ({
  movie,
  allMovies,
  seriesList,
  userId,
  initialAutoPlay = true,
  resumeSeconds = 0,
  inWatchlist,
  onClose,
  onSelectMovie,
  onToggleWatchlist,
  onProgressUpdate,
  onEngagementChanged,
  onOpenDownload,
  onOpenOfflinePlayer,
}) => {
  const [playerPlaying, setPlayerPlaying] = useState(initialAutoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(resumeSeconds);
  const [totalDuration, setTotalDuration] = useState(
    movie.durationSeconds || 600
  );

  const [engagement, setEngagement] = useState<MovieEngagementSummary>({
    movieId: movie.id,
    likesCount: movie.likeCount || 0,
    averageRating: 4.8,
    ratingsCount: 3,
    commentsCount: 0,
    userLiked: false,
    userRating: null,
  });

  const [showShareCard, setShowShareCard] = useState(false);
  const [quickCopiedLink, setQuickCopiedLink] = useState(false);

  const shareUrl = buildMovieShareUrl(movie.id);
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(
    buildMovieShareMessage(movie, shareUrl)
  )}`;

  const handleQuickCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setQuickCopiedLink(true);
      window.setTimeout(() => setQuickCopiedLink(false), 2500);
    } catch {
      // ignore
    }
  };

  const videoViewportRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const seriesEpisodes = movie.seriesId
    ? allMovies
        .filter((m) => m.seriesId === movie.seriesId)
        .sort(
          (a, b) =>
            (a.seasonNumber || 1) - (b.seasonNumber || 1) ||
            (a.episodeNumber || 1) - (b.episodeNumber || 1)
        )
    : [];

  // Keep seriesList referenced cleanly
  void seriesList;

  const nextBingeMovie = React.useMemo(() => {
    if (seriesEpisodes.length > 1) {
      const idx = seriesEpisodes.findIndex((ep) => ep.id === movie.id);
      if (idx >= 0 && seriesEpisodes[idx + 1]) {
        return seriesEpisodes[idx + 1];
      }
    }
    const sameCat = allMovies.filter(
      (m) => m.id !== movie.id && m.primaryCategory === movie.primaryCategory
    );
    if (sameCat.length > 0) return sameCat[0];
    const anyOther = allMovies.filter((m) => m.id !== movie.id);
    return anyOther[0] || null;
  }, [allMovies, movie.id, movie.primaryCategory, seriesEpisodes]);

  const [bingeCountdown, setBingeCountdown] = useState<number | null>(null);

  const triggerBingeNext = () => {
    if (nextBingeMovie) {
      setBingeCountdown(5);
    }
  };

  useEffect(() => {
    if (bingeCountdown === null) return;
    if (bingeCountdown <= 0) {
      setBingeCountdown(null);
      if (nextBingeMovie) {
        onSelectMovie(nextBingeMovie, true);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setBingeCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [bingeCountdown, nextBingeMovie, onSelectMovie]);

  // Lock background page scroll while Theatre Modal is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Fetch lightweight engagement summary after stream begins
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/movies/${encodeURIComponent(
            movie.id
          )}/engagement?userId=${encodeURIComponent(userId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.engagement) {
          setEngagement(data.engagement);
        }
      } catch {
        // ignore
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [movie.id, userId]);

  const [playerServer, setPlayerServer] = useState<'standard' | 'nocookie'>('nocookie');
  const [streamQuality, setStreamQuality] = useState<
    'hd1080' | 'hd1440' | 'highres' | 'hd720' | 'large'
  >('hd1080');
  const [startOffsetSec, setStartOffsetSec] = useState<number>(() =>
    resumeSeconds > 15 ? Math.floor(resumeSeconds) : 0
  );

  const applyLiveStreamQuality = React.useCallback(
    (targetQuality: 'hd1080' | 'hd1440' | 'highres' | 'hd720' | 'large') => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        const rangeArgs =
          targetQuality === 'large'
            ? ['small', 'large']
            : targetQuality === 'hd720'
            ? ['large', 'hd720']
            : targetQuality === 'hd1080'
            ? ['hd720', 'hd1080']
            : ['hd1080', 'highres'];
        win.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setPlaybackQualityRange',
            args: rangeArgs,
          }),
          '*'
        );
        win.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setPlaybackQuality',
            args: [targetQuality],
          }),
          '*'
        );
      } catch {
        // ignore cross-origin postMessage errors
      }
    },
    []
  );

  const sendPlayerCommand = React.useCallback(
    (func: string, args: any[] = []) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage(
          JSON.stringify({
            event: 'command',
            func,
            args,
          }),
          '*'
        );
      } catch {
        // ignore
      }
    },
    []
  );

  const [userExplicitlyPaused, setUserExplicitlyPaused] = useState(false);
  const latestTimestampRef = useRef<number>(resumeSeconds);
  const latestDurationRef = useRef<number>(movie.durationSeconds || 5400);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate;
  }, [onProgressUpdate]);

  const toggleNativePlayPause = React.useCallback(() => {
    if (playerPlaying) {
      sendPlayerCommand('pauseVideo');
      setPlayerPlaying(false);
      setUserExplicitlyPaused(true);
      onProgressUpdateRef.current(
        movie.id,
        Math.floor(latestTimestampRef.current),
        latestDurationRef.current
      );
    } else {
      sendPlayerCommand('playVideo');
      setPlayerPlaying(true);
      setUserExplicitlyPaused(false);
    }
  }, [playerPlaying, sendPlayerCommand, movie.id]);

  const toggleNativeMute = React.useCallback(() => {
    if (isMuted) {
      sendPlayerCommand('unMute');
      setIsMuted(false);
    } else {
      sendPlayerCommand('mute');
      setIsMuted(true);
    }
  }, [isMuted, sendPlayerCommand]);

  const seekRelativeSeconds = React.useCallback(
    (deltaSec: number) => {
      const nextSec = Math.min(
        totalDuration,
        Math.max(0, Math.floor(currentTimestamp + deltaSec))
      );
      setCurrentTimestamp(nextSec);
      latestTimestampRef.current = nextSec;
      sendPlayerCommand('seekTo', [nextSec, true]);
      setUserExplicitlyPaused(false);
      if (!playerPlaying) {
        sendPlayerCommand('playVideo');
        setPlayerPlaying(true);
      }
    },
    [currentTimestamp, totalDuration, playerPlaying, sendPlayerCommand]
  );

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null);

  const seekToAbsoluteSeconds = React.useCallback(
    (targetSec: number) => {
      const clamped = Math.min(
        totalDuration,
        Math.max(0, Math.floor(targetSec))
      );
      setCurrentTimestamp(clamped);
      latestTimestampRef.current = clamped;
      sendPlayerCommand('seekTo', [clamped, true]);
      setUserExplicitlyPaused(false);
      if (!playerPlaying) {
        sendPlayerCommand('playVideo');
        setPlayerPlaying(true);
      }
    },
    [totalDuration, playerPlaying, sendPlayerCommand]
  );

  // Smooth local progress ticker while movie is playing
  useEffect(() => {
    if (!playerPlaying || isScrubbing) return;
    const interval = window.setInterval(() => {
      setCurrentTimestamp((prev) => {
        const next = Math.min(totalDuration, prev + 1);
        latestTimestampRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [playerPlaying, isScrubbing, totalDuration]);

  // Save watch progress cleanly when closing the player or switching movies
  useEffect(() => {
    const targetMovieId = movie.id;
    return () => {
      if (latestTimestampRef.current > 5) {
        onProgressUpdateRef.current(
          targetMovieId,
          Math.floor(latestTimestampRef.current),
          latestDurationRef.current
        );
      }
    };
  }, [movie.id]);

  // Listen to YouTube IFrame API postMessage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !event.origin.includes('youtube.com') &&
        !event.origin.includes('youtube-nocookie.com')
      ) {
        return;
      }
      try {
        const payload =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.event === 'infoDelivery' && payload?.info) {
          if (
            typeof payload.info.currentTime === 'number' &&
            !isScrubbing
          ) {
            setCurrentTimestamp(payload.info.currentTime);
            latestTimestampRef.current = payload.info.currentTime;
          }
          if (
            typeof payload.info.duration === 'number' &&
            payload.info.duration > 0
          ) {
            setTotalDuration(payload.info.duration);
            latestDurationRef.current = payload.info.duration;
          }
          if (typeof payload.info.playerState === 'number') {
            if (payload.info.playerState === 1) {
              setPlayerPlaying(true);
              setUserExplicitlyPaused(false);
            } else if (payload.info.playerState === 2) {
              setPlayerPlaying(false);
            } else if (payload.info.playerState === 0 && nextBingeMovie) {
              setBingeCountdown(5);
            }
          }
        }
        if (payload?.event === 'onReady') {
          applyLiveStreamQuality(streamQuality);
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyLiveStreamQuality, streamQuality, nextBingeMovie, isScrubbing]);

  // Only initialize startOffsetSec when movie.id changes so embedSrcUrl never reloads mid-playback
  useEffect(() => {
    setPlayerPlaying(true);
    setUserExplicitlyPaused(false);
    setCurrentTimestamp(resumeSeconds);
    latestTimestampRef.current = resumeSeconds;
    setStartOffsetSec(resumeSeconds > 15 ? Math.floor(resumeSeconds) : 0);
    const dur = movie.durationSeconds || 5400;
    setTotalDuration(dur);
    latestDurationRef.current = dur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, movie.youtubeVideoId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShareCard) {
          setShowShareCard(false);
        } else {
          onClose();
        }
      } else if (
        e.key === 'ArrowRight' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        seekRelativeSeconds(15);
      } else if (
        e.key === 'ArrowLeft' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        seekRelativeSeconds(-15);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, seekRelativeSeconds, showShareCard]);

  const [isMobileTheatreExpanded, setIsMobileTheatreExpanded] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight && window.innerHeight <= 560;
  });
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef<number | null>(null);
  const [screenFitMode, setScreenFitMode] = useState<'fit' | 'fill' | 'zoom'>('fit');

  const isImmersiveCinema =
    isNativeFullscreen || isMobileTheatreExpanded || isLandscapeViewport;

  const revealHudTemporarily = React.useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
  }, []);

  // Track device rotation / landscape slide & native fullscreen state
  useEffect(() => {
    const checkOrientation = () => {
      const landscape =
        window.innerWidth > window.innerHeight && window.innerHeight <= 560;
      setIsLandscapeViewport(landscape);
      setHudVisible(true);
    };

    const handleFullscreenChange = () => {
      const doc = document as any;
      const fsActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsNativeFullscreen(fsActive);
      if (!fsActive) {
        setIsMobileTheatreExpanded(false);
      }
      setHudVisible(true);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Auto-hide header & bottom controls in landscape or fullscreen while playing so 100% of screen shows the movie
  useEffect(() => {
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
    if (
      isImmersiveCinema &&
      playerPlaying &&
      !isScrubbing &&
      !showShareCard &&
      bingeCountdown === null &&
      !userExplicitlyPaused
    ) {
      hudTimerRef.current = window.setTimeout(() => {
        setHudVisible(false);
      }, 3200);
    } else {
      setHudVisible(true);
    }
    return () => {
      if (hudTimerRef.current) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    };
  }, [
    isImmersiveCinema,
    playerPlaying,
    isScrubbing,
    showShareCard,
    bingeCountdown,
    userExplicitlyPaused,
    hudVisible,
  ]);

  const cycleScreenFitMode = () => {
    revealHudTemporarily();
    setScreenFitMode((prev) =>
      prev === 'fit' ? 'fill' : prev === 'fill' ? 'zoom' : 'fit'
    );
  };

  // Cinema zoom/fill options so portrait & 20:9 landscape viewers can fill the entire screen cleanly
  const screenFitScaleClass =
    screenFitMode === 'zoom'
      ? 'scale-[1.36] origin-center'
      : screenFitMode === 'fill'
      ? 'scale-[1.18] origin-center'
      : '';

  const screenFitLabel =
    screenFitMode === 'zoom'
      ? 'Max Zoom'
      : screenFitMode === 'fill'
      ? 'Screen Fill'
      : '16:9 Fit';

  const embedSrcUrl = React.useMemo(() => {
    const host =
      playerServer === 'nocookie'
        ? 'https://www.youtube-nocookie.com'
        : 'https://www.youtube.com';
    const params = new URLSearchParams({
      autoplay: initialAutoPlay ? '1' : '0',
      modestbranding: '1',
      rel: '0',
      iv_load_policy: '3',
      playsinline: '1',
      enablejsapi: '1',
      vq: streamQuality,
      hl: 'en',
    });
    if (typeof window !== 'undefined' && window.location.origin) {
      params.set('origin', window.location.origin);
    }
    if (startOffsetSec > 15) {
      params.set('start', String(startOffsetSec));
    }
    return `${host}/embed/${movie.youtubeVideoId}?${params.toString()}`;
  }, [movie.youtubeVideoId, playerServer, initialAutoPlay, startOffsetSec]);

  const handleIframeLoad = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'listening' }), '*');
      applyLiveStreamQuality(streamQuality);
      window.setTimeout(() => applyLiveStreamQuality(streamQuality), 600);
      window.setTimeout(() => applyLiveStreamQuality(streamQuality), 1800);
    } catch {
      // ignore
    }
  };

  const toggleFullscreen = async () => {
    const el = videoViewportRef.current as any;
    if (!el) return;
    const doc = document as any;
    const currentlyFullscreen =
      Boolean(doc.fullscreenElement || doc.webkitFullscreenElement) ||
      isMobileTheatreExpanded;

    try {
      if (currentlyFullscreen) {
        setIsMobileTheatreExpanded(false);
        setHudVisible(true);
        if (doc.fullscreenElement || doc.webkitFullscreenElement) {
          if (doc.exitFullscreen) {
            await doc.exitFullscreen();
          } else if (doc.webkitExitFullscreen) {
            doc.webkitExitFullscreen();
          }
        }
        if (
          typeof screen !== 'undefined' &&
          screen.orientation &&
          typeof (screen.orientation as any).unlock === 'function'
        ) {
          try {
            (screen.orientation as any).unlock();
          } catch {
            // ignore
          }
        }
        return;
      }

      // Always activate full-viewport immersive mode (works immediately on iPhone Safari too)
      setIsMobileTheatreExpanded(true);
      setHudVisible(true);

      if (el.requestFullscreen) {
        await el.requestFullscreen();
        if (
          typeof screen !== 'undefined' &&
          screen.orientation &&
          typeof (screen.orientation as any).lock === 'function'
        ) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch {
            // ignore if device does not allow orientation lock
          }
        }
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch {
      // Keep immersive expanded viewport even if native Fullscreen API rejects
      setIsMobileTheatreExpanded(true);
      setHudVisible(true);
    }
  };

  const handleToggleLike = async () => {
    try {
      const res = await fetch(
        `/api/movies/${encodeURIComponent(movie.id)}/like`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.engagement) {
          setEngagement(data.engagement);
        }
        if (onEngagementChanged) onEngagementChanged();
      }
    } catch {
      // ignore
    }
  };

  const formatSec = (sec: number) => {
    const safe = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = Math.floor(safe % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const displaySeconds =
    isScrubbing && scrubPreviewSec !== null ? scrubPreviewSec : currentTimestamp;

  const progressPct =
    totalDuration > 0
      ? Math.min(100, Math.max(0, (displaySeconds / totalDuration) * 100))
      : 0;

  const bufferedPct = Math.min(100, progressPct + 14);

  return (
    <div
      ref={videoViewportRef}
      onMouseMove={() => {
        if (isImmersiveCinema) revealHudTemporarily();
      }}
      className="fixed inset-0 z-50 w-full h-[100dvh] bg-black flex flex-col justify-between overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
    >
      {/* TOP CINEMA EDGE BAR — Docked in portrait, floating auto-hide overlay in landscape/fullscreen */}
      <header
        onClick={(e) => {
          e.stopPropagation();
          revealHudTemporarily();
        }}
        style={{
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          contain: 'layout paint',
        }}
        className={`${
          isImmersiveCinema
            ? `absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/65 to-transparent border-b-0 transition-opacity duration-300 ${
                hudVisible
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`
            : 'relative z-20 shrink-0 bg-black/95 border-b border-white/10'
        } h-12 sm:h-14 flex items-center justify-between pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-luxury text-[#FF1E4D] tracking-[0.12em] text-[10px] sm:text-xs font-black uppercase whitespace-nowrap shrink-0">
            TK STORYWORLD
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <h1 className="font-display text-xs sm:text-sm font-semibold text-white truncate">
            {movie.title}
          </h1>
          {movie.episodeNumber && (
            <>
              <span className="hidden sm:inline text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline font-mono text-xs text-[#F59E0B] tabular-nums whitespace-nowrap shrink-0">
                S{String(movie.seasonNumber || 1).padStart(2, '0')} E
                {String(movie.episodeNumber).padStart(2, '0')}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
          {onOpenDownload && (
            <button
              type="button"
              onClick={() => onOpenDownload(movie)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold shadow transition-colors cursor-pointer"
              title="Download Movie (.MP4) to Device"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isMovieInDeviceVault(movie.id) ? 'Saved' : 'Download'}
              </span>
            </button>
          )}

          {onOpenOfflinePlayer && (
            <button
              type="button"
              onClick={() => onOpenOfflinePlayer(movie)}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Play Offline (Zero Data)"
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleLike}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
              engagement.userLiked
                ? 'bg-[#E11D48] border-[#E11D48] text-white'
                : 'bg-white/5 hover:bg-white/15 border-white/10 text-slate-200'
            }`}
            title="Love This Movie"
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                engagement.userLiked ? 'fill-current' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => onToggleWatchlist(movie.id)}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs transition-colors cursor-pointer inline-flex items-center gap-1 ${
              inWatchlist
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 hover:bg-white/15 border-white/10 text-slate-200'
            }`}
            title={inWatchlist ? 'In Watchlist' : 'Save to Watchlist'}
          >
            {inWatchlist ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowShareCard((prev) => !prev)}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
              showShareCard
                ? 'bg-[#F59E0B] border-[#F59E0B] text-black'
                : 'bg-white/5 hover:bg-white/15 border-white/10 text-white'
            }`}
            title="Share Movie"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-200 hover:text-white bg-white/10 hover:bg-[#E11D48] transition-colors cursor-pointer"
            aria-label="Close Movie Theatre"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* FULL-SCREEN PURE BLACK CINEMA MOVIE STAGE — Fills 100% of screen in landscape & fullscreen */}
      <main
        className={`${
          isImmersiveCinema ? 'absolute inset-0 z-10' : 'relative flex-1'
        } w-full h-full bg-black overflow-hidden flex items-center justify-center`}
      >
        {/* In portrait (plenty of vertical height), -top-[56px] hides YouTube chrome cleanly. In landscape/fullscreen, full 100% frame prevents clipping movie top/bottom edges */}
        <div className={`relative w-full h-full overflow-hidden transition-transform duration-200 ${screenFitScaleClass}`}>
          <iframe
            ref={iframeRef}
            key={`${movie.youtubeVideoId}-${playerServer}`}
            src={embedSrcUrl}
            onLoad={handleIframeLoad}
            title={movie.title}
            loading="eager"
            className={`border-0 block bg-black [image-rendering:-webkit-optimize-contrast] contrast-[1.03] saturate-[1.04] filter ${
              isImmersiveCinema
                ? 'absolute inset-0 w-full h-full'
                : 'absolute inset-x-0 -top-[56px] w-full h-[calc(100%+112px)]'
            }`}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
            allowFullScreen
          />
        </div>

        {/* Subtle edge tap-to-reveal HUD hotspot & corner controls pill when HUD auto-hides in landscape/fullscreen */}
        {isImmersiveCinema && !hudVisible && !userExplicitlyPaused && !showShareCard && bingeCountdown === null && (
          <>
            <button
              type="button"
              onClick={revealHudTemporarily}
              aria-label="Show player controls"
              className="absolute top-0 inset-x-0 h-8 z-20 bg-transparent cursor-pointer"
            />
            <button
              type="button"
              onClick={revealHudTemporarily}
              className="absolute top-[max(0.65rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/55 hover:bg-black/85 border border-white/20 text-white/85 text-[11px] font-semibold backdrop-blur-sm transition-opacity cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3 text-[#F59E0B]" />
              <span>Controls</span>
            </button>
          </>
        )}

        {/* Native TK STORYWORLD Paused Cinema Shield — Hides YouTube's pause-screen banners when paused */}
        {userExplicitlyPaused && bingeCountdown === null && !showShareCard && (
          <div
            onClick={toggleNativePlayPause}
            className="absolute inset-0 z-[15] bg-black/85 flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-white flex items-center justify-center shadow-2xl mb-4 transition-transform hover:scale-110">
              <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-current ml-0.5" />
            </div>
            <div className="font-luxury text-[#FF1E4D] tracking-[0.16em] text-[11px] font-black uppercase mb-1.5">
              TK STORYWORLD CINEMA · PAUSED
            </div>
            <h2 className="font-display text-base sm:text-xl font-bold text-white max-w-md line-clamp-2">
              {movie.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5">
              Tap anywhere to resume movie · {formatSec(displaySeconds)} / {formatSec(totalDuration)}
            </p>
            {resumeSeconds > 15 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  seekToAbsoluteSeconds(0);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart from Beginning</span>
              </button>
            )}
          </div>
        )}

        {/* Quick Share Overlay Card (only visible when Share icon is tapped) */}
        {showShareCard && (
          <div
            onClick={() => setShowShareCard(false)}
            className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-[#0B0E15] border border-white/15 p-4 space-y-3 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <span className="font-display text-sm font-bold text-white">
                  Share This Movie
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={whatsappShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold"
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-current" />
                    <span>WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleQuickCopyLink}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
                  >
                    {quickCopiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#F59E0B]" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShareCard(false)}
                    className="p-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <BrandedShareCard
                movie={movie}
                averageRating={engagement.averageRating}
                likesCount={engagement.likesCount}
                onClose={() => setShowShareCard(false)}
              />
            </div>
          </div>
        )}

        {/* AUTO-BINGE NEXT OVERLAY */}
        {bingeCountdown !== null && nextBingeMovie && (
          <div className="absolute inset-0 bg-[#050505]/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <div className="w-14 h-14 rounded-full bg-[#E11D48]/25 border border-[#E11D48]/50 flex items-center justify-center mb-3 text-[#E11D48]">
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-1">
              🔥 Playing Next in {bingeCountdown}s · Auto-Binge
            </div>
            <h3 className="font-display text-lg sm:text-xl font-bold text-white max-w-md line-clamp-1 mb-1">
              {nextBingeMovie.title}
            </h3>
            <p className="text-xs text-slate-300 mb-5 max-w-sm line-clamp-1">
              {nextBingeMovie.hookTag ? `${nextBingeMovie.hookTag} · ` : ''}
              {nextBingeMovie.primaryCategory} · {nextBingeMovie.durationFormatted}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setBingeCountdown(null);
                  onSelectMovie(nextBingeMovie, true);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Watch Next Now</span>
              </button>
              <button
                onClick={() => setBingeCountdown(null)}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM CINEMA CONTROL BAR + INTERACTIVE VIDEO PROGRESS BAR */}
      <footer
        onClick={(e) => {
          e.stopPropagation();
          revealHudTemporarily();
        }}
        style={{
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          contain: 'layout paint',
        }}
        className={`${
          isImmersiveCinema
            ? `absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent border-t-0 transition-opacity duration-300 ${
                hudVisible
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`
            : 'relative z-20 shrink-0 bg-black/95 border-t border-white/15'
        } pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:py-2.5 flex flex-col gap-1.5 sm:gap-2`}
      >
        {/* ROW 1: INTERACTIVE VIDEO PROGRESS BAR & SCRUBBER TIMELINE */}
        <div className="flex items-center gap-2.5 w-full">
          <span className="font-mono text-[11px] sm:text-xs text-white font-semibold tabular-nums shrink-0 min-w-[44px] sm:min-w-[52px]">
            {formatSec(displaySeconds)}
          </span>

          <div className="relative flex-1 h-5 flex items-center group cursor-pointer">
            <div className="w-full h-1.5 sm:h-2 rounded-full bg-white/20 overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 bg-white/25 transition-all duration-300"
                style={{ width: `${bufferedPct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#E11D48] via-[#FF1E4D] to-[#F59E0B]"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-[#E11D48] shadow-lg transition-transform group-hover:scale-125"
              style={{ left: `${progressPct}%` }}
            />

            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(totalDuration))}
              step={1}
              value={Math.floor(displaySeconds)}
              aria-label="Video Progress Bar"
              onMouseDown={() => setIsScrubbing(true)}
              onTouchStart={() => setIsScrubbing(true)}
              onChange={(e) => {
                const nextVal = Number(e.target.value);
                setIsScrubbing(true);
                setScrubPreviewSec(nextVal);
              }}
              onMouseUp={(e) => {
                const targetVal = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                setScrubPreviewSec(null);
                seekToAbsoluteSeconds(targetVal);
              }}
              onTouchEnd={(e) => {
                const targetVal = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                setScrubPreviewSec(null);
                seekToAbsoluteSeconds(targetVal);
              }}
              onKeyUp={(e) => {
                const targetVal = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                setScrubPreviewSec(null);
                seekToAbsoluteSeconds(targetVal);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>

          <span className="font-mono text-[11px] sm:text-xs text-slate-300 tabular-nums shrink-0 min-w-[44px] sm:min-w-[52px] text-right">
            {formatSec(totalDuration)}
          </span>
        </div>

        {/* ROW 2: PLAYBACK CONTROLS, SCREEN FIT, QUALITY & NEXT */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleNativePlayPause}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white cursor-pointer shrink-0"
              title={playerPlaying ? 'Pause Movie' : 'Play Movie'}
            >
              {playerPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => seekRelativeSeconds(-15)}
              className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-mono cursor-pointer shrink-0"
              title="Rewind 15 Seconds"
            >
              -15s
            </button>

            <button
              type="button"
              onClick={() => seekRelativeSeconds(15)}
              className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-mono cursor-pointer shrink-0"
              title="Fast-Forward 15 Seconds"
            >
              +15s
            </button>

            <button
              type="button"
              onClick={toggleNativeMute}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 cursor-pointer shrink-0"
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>

            <div className="flex items-center gap-1 ml-0.5">
              <button
                type="button"
                onClick={() => setPlayerServer('nocookie')}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  playerServer === 'nocookie'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
                title="Fast Privacy CDN Server"
              >
                CDN 1
              </button>
              <button
                type="button"
                onClick={() => setPlayerServer('standard')}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  playerServer === 'standard'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
                title="Standard CDN Server"
              >
                CDN 2
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextQ =
                    streamQuality === 'hd1080'
                      ? 'highres'
                      : streamQuality === 'highres'
                      ? 'hd720'
                      : streamQuality === 'hd720'
                      ? 'large'
                      : 'hd1080';
                  setStreamQuality(nextQ);
                  applyLiveStreamQuality(nextQ);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold cursor-pointer whitespace-nowrap transition-colors"
                title="Change Playback Resolution"
              >
                <span>
                  {streamQuality === 'highres'
                    ? '✨ 4K Ultra'
                    : streamQuality === 'hd1080'
                    ? '💎 1080p FHD'
                    : streamQuality === 'hd720'
                    ? '⚡ 720p HD'
                    : '🛡️ 480p Saver'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {nextBingeMovie && (
              <button
                type="button"
                onClick={triggerBingeNext}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap"
                title={`Binge Next: ${nextBingeMovie.title}`}
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Next</span>
              </button>
            )}
            <button
              type="button"
              onClick={cycleScreenFitMode}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-medium cursor-pointer whitespace-nowrap"
              title="Toggle Cinema Screen Fit / Zoom"
            >
              <span>{screenFitLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shadow"
              title={
                isNativeFullscreen || isMobileTheatreExpanded
                  ? 'Exit Fullscreen'
                  : 'Fullscreen Cinema'
              }
            >
              {isNativeFullscreen || isMobileTheatreExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Exit Full</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Full</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  FastForward,
  Heart,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  Send,
  Share2,
  ShieldAlert,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  MovieCommentItem,
  MovieEngagementSummary,
  MovieItem,
  MovieSeries,
} from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';
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
}

const REACTION_OPTIONS = [
  'Loved It',
  'Best Couple',
  'So Emotional',
  'Plot Twist',
  'Masterpiece',
];

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
  onPlaybackError,
  onEngagementChanged,
  onOpenDownload,
}) => {
  const [hasStarted, setHasStarted] = useState(initialAutoPlay);
  const [playerPlaying, setPlayerPlaying] = useState(initialAutoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(resumeSeconds);
  const [totalDuration, setTotalDuration] = useState(
    movie.durationSeconds || 600
  );
  const [selectedSeason, setSelectedSeason] = useState<number>(
    movie.seasonNumber || 1
  );

  // Engagement: Likes, Star Ratings & Comments
  const [engagement, setEngagement] = useState<MovieEngagementSummary>({
    movieId: movie.id,
    likesCount: movie.likeCount || 0,
    averageRating: 4.8,
    ratingsCount: 3,
    commentsCount: 0,
    userLiked: false,
    userRating: null,
  });
  const [comments, setComments] = useState<MovieCommentItem[]>([]);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [selectedReaction, setSelectedReaction] = useState<string>('Loved It');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
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

  const [streamError, setStreamError] = useState<string | null>(null);

  const playerContainerId = `aetheria-stream-${movie.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  const videoViewportRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const progressTimerRef = useRef<number | null>(null);

  const parentSeries = movie.seriesId
    ? seriesList.find((s) => s.id === movie.seriesId) || null
    : null;

  const seriesEpisodes = movie.seriesId
    ? allMovies
        .filter((m) => m.seriesId === movie.seriesId)
        .sort(
          (a, b) =>
            (a.seasonNumber || 1) - (b.seasonNumber || 1) ||
            (a.episodeNumber || 1) - (b.episodeNumber || 1)
        )
    : [];

  const availableSeasons = Array.from(
    new Set(seriesEpisodes.map((ep) => ep.seasonNumber || 1))
  ).sort((a, b) => a - b);

  const relatedMovies = React.useMemo(() => {
    const sameCat = allMovies.filter(
      (m) =>
        m.id !== movie.id &&
        (m.primaryCategory === movie.primaryCategory ||
          m.secondaryCategories.includes(movie.primaryCategory))
    );
    const newMovies = allMovies.filter(
      (m) => m.id !== movie.id && m.primaryCategory === 'New Movies'
    );
    const combined = [...sameCat, ...newMovies];
    const seen = new Set<string>();
    const unique: MovieItem[] = [];
    for (const item of combined) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
      if (unique.length >= 8) break;
    }
    return unique;
  }, [allMovies, movie.id, movie.primaryCategory]);

  const [whatsappSharesCount, setWhatsappSharesCount] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('tk_storyworld_wa_shares_v1') || '0');
    } catch {
      return 0;
    }
  });

  const recordWhatsAppShare = () => {
    setWhatsappSharesCount((prev) => {
      const next = prev + 1;
      try {
        localStorage.setItem('tk_storyworld_wa_shares_v1', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const liveWatchersCount = React.useMemo(() => {
    const seed = movie.id
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return 840 + (seed % 1950);
  }, [movie.id]);

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

  // Lock background page scroll while Theatre Modal is active to prevent GPU layout thrashing
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Defer Likes, Ratings & Comments fetch by 1.5s so 100% of network & main-thread priority goes to initial video buffering
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
          if (data.engagement.userRating) {
            setSelectedRating(data.engagement.userRating);
          }
        }
        setComments(data.comments || []);
      } catch {
        // ignore
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [movie.id, userId]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [playerServer, setPlayerServer] = useState<'standard' | 'nocookie'>('nocookie');
  const [streamQuality, setStreamQuality] = useState<'hd720' | 'large' | 'hd1080'>('hd720');
  const [isStreamSettled, setIsStreamSettled] = useState(false);
  const [startOffsetSec, setStartOffsetSec] = useState<number>(() =>
    resumeSeconds > 15 ? Math.floor(resumeSeconds) : 0
  );

  const applyLiveStreamQuality = React.useCallback(
    (targetQuality: 'hd720' | 'large' | 'hd1080') => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        const rangeArgs =
          targetQuality === 'large'
            ? ['small', 'large']
            : targetQuality === 'hd720'
            ? ['medium', 'hd720']
            : ['hd720', 'hd1080'];
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

  const toggleNativePlayPause = React.useCallback(() => {
    if (playerPlaying) {
      sendPlayerCommand('pauseVideo');
      setPlayerPlaying(false);
    } else {
      sendPlayerCommand('playVideo');
      setPlayerPlaying(true);
    }
  }, [playerPlaying, sendPlayerCommand]);

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
      sendPlayerCommand('seekTo', [nextSec, true]);
      if (!playerPlaying) {
        sendPlayerCommand('playVideo');
        setPlayerPlaying(true);
      }
      onProgressUpdate(movie.id, nextSec, totalDuration);
    },
    [currentTimestamp, totalDuration, playerPlaying, sendPlayerCommand, movie.id, onProgressUpdate]
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
      sendPlayerCommand('seekTo', [clamped, true]);
      if (!playerPlaying) {
        sendPlayerCommand('playVideo');
        setPlayerPlaying(true);
      }
      onProgressUpdate(movie.id, clamped, totalDuration);
    },
    [totalDuration, playerPlaying, sendPlayerCommand, movie.id, onProgressUpdate]
  );

  // Smooth 1-second progress ticker while movie is playing + periodic progress persistence
  useEffect(() => {
    if (!playerPlaying || isScrubbing) return;
    const interval = window.setInterval(() => {
      setCurrentTimestamp((prev) => {
        const next = Math.min(totalDuration, prev + 1);
        if (Math.floor(next) % 10 === 0) {
          onProgressUpdate(movie.id, Math.floor(next), totalDuration);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [playerPlaying, isScrubbing, totalDuration, movie.id, onProgressUpdate]);

  // Listen to YouTube IFrame API postMessage events and lock stream into hardware-accelerated 480p/720p H.264/VP9 range so 4K/AV1 never cracks audio
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
          }
          if (
            typeof payload.info.duration === 'number' &&
            payload.info.duration > 0
          ) {
            setTotalDuration(payload.info.duration);
          }
          if (typeof payload.info.playerState === 'number') {
            if (payload.info.playerState === 1) {
              setPlayerPlaying(true);
            } else if (payload.info.playerState === 2) {
              setPlayerPlaying(false);
            } else if (payload.info.playerState === 0 && nextBingeMovie) {
              setBingeCountdown(5);
            }
          }
        }
        if (
          payload?.event === 'onReady' ||
          payload?.event === 'onStateChange' ||
          payload?.event === 'infoDelivery'
        ) {
          applyLiveStreamQuality(streamQuality);
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyLiveStreamQuality, streamQuality, nextBingeMovie, isScrubbing]);

  useEffect(() => {
    setHasStarted(true);
    setPlayerPlaying(true);
    setIsStreamSettled(false);
    setCurrentTimestamp(resumeSeconds);
    setStartOffsetSec(resumeSeconds > 15 ? Math.floor(resumeSeconds) : 0);
    setTotalDuration(movie.durationSeconds || 5400);
    setSelectedSeason(movie.seasonNumber || 1);
    setStreamError(null);
    const settleTimer = window.setTimeout(() => {
      setIsStreamSettled(true);
    }, 1600);
    return () => window.clearTimeout(settleTimer);
  }, [movie.id, movie.youtubeVideoId, initialAutoPlay, movie.durationSeconds, movie.seasonNumber, resumeSeconds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [onClose, seekRelativeSeconds]);

  const [isMobileTheatreExpanded, setIsMobileTheatreExpanded] = useState(false);
  const [screenFitMode, setScreenFitMode] = useState<'fill' | 'zoom' | 'fit'>('fit');

  const cycleScreenFitMode = () => {
    setScreenFitMode((prev) =>
      prev === 'fit' ? 'fill' : prev === 'fill' ? 'zoom' : 'fit'
    );
  };

  // In default 'fit' mode, avoid any CSS transform class so the browser's GPU promotes the video iframe to a Direct Hardware Overlay
  const screenFitScaleClass =
    screenFitMode === 'zoom'
      ? 'scale-[1.34] origin-center'
      : screenFitMode === 'fill'
      ? 'scale-[1.18] origin-center'
      : '';

  const screenFitLabel =
    screenFitMode === 'zoom'
      ? 'Ultrawide Fill'
      : screenFitMode === 'fill'
      ? 'Complete Screen'
      : '16:9 Standard';

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
    try {
      const doc = document as any;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
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
        setIsMobileTheatreExpanded(false);
      } else if (el.requestFullscreen) {
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
      } else {
        // Fallback for mobile browsers that restrict div fullscreen (e.g. iPhone Safari)
        setIsMobileTheatreExpanded((prev) => !prev);
      }
    } catch {
      setIsMobileTheatreExpanded((prev) => !prev);
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

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      setSubmittingComment(true);
      const res = await fetch(
        `/api/movies/${encodeURIComponent(movie.id)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            rating: selectedRating,
            reaction: selectedReaction,
            content: commentText.trim(),
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        if (data.engagement) setEngagement(data.engagement);
        setCommentText('');
        if (onEngagementChanged) onEngagementChanged();
      }
    } catch {
      // ignore
    } finally {
      setSubmittingComment(false);
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#050505] p-0 sm:p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
    >
      {/* Pure rectangular container (no rounded-2xl / shadow-2xl) so GPU promotes video directly to Hardware Overlay without alpha-mask shader clipping */}
      <div className="relative w-full max-w-5xl h-[100dvh] sm:h-auto sm:max-h-[95vh] bg-[#0B0D13] border-0 sm:border border-white/10 overflow-hidden flex flex-col">
        {/* Sticky 16:9 Cinema Video Player — Single Top Banner & Single Bottom Banner with Interactive Video Progress Bar */}
        <div
          ref={videoViewportRef}
          className={`relative w-full aspect-video bg-black overflow-hidden shrink-0 border-b border-white/10 ${
            isMobileTheatreExpanded ? 'fixed inset-0 z-50 aspect-auto h-full' : ''
          }`}
        >
          {/* Cropped 16:9 Cinema Frame — Pushes YouTube's top title bar (-top-[60px]) and bottom "Watch on YouTube" / logo banner (+120px height) completely outside the overflow-hidden box */}
          <div className={`relative w-full h-full overflow-hidden ${screenFitScaleClass}`}>
            <iframe
              ref={iframeRef}
              key={`${movie.youtubeVideoId}-${playerServer}`}
              src={embedSrcUrl}
              onLoad={handleIframeLoad}
              title={movie.title}
              loading="eager"
              className="absolute inset-x-0 -top-[60px] w-full h-[calc(100%+120px)] border-0 block bg-black"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
              allowFullScreen
            />
          </div>

          {/* Native TK STORYWORLD Paused Cinema Shield — Hides YouTube's pause-screen banners when paused */}
          {!playerPlaying && bingeCountdown === null && (
            <div
              onClick={toggleNativePlayPause}
              className="absolute inset-0 z-[15] bg-black/80 flex flex-col items-center justify-center p-4 text-center cursor-pointer select-none"
            >
              <div className="w-16 h-16 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-white flex items-center justify-center shadow-2xl mb-3 transition-transform hover:scale-110">
                <Play className="w-7 h-7 fill-current ml-0.5" />
              </div>
              <div className="font-luxury text-[#FF1E4D] tracking-[0.16em] text-[11px] font-black uppercase mb-1">
                TK STORYWORLD CINEMA · PAUSED
              </div>
              <h3 className="font-display text-sm sm:text-lg font-bold text-white max-w-md line-clamp-1">
                {movie.title}
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Tap anywhere to resume movie in HD · {formatSec(displaySeconds)} / {formatSec(totalDuration)}
              </p>
            </div>
          )}

          {/* Single Solid Top TK STORYWORLD Banner — Covers any top edge overlay */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              contain: 'layout paint',
            }}
            className="absolute top-0 inset-x-0 h-11 sm:h-14 z-20 bg-[#050505] border-b border-white/10 flex items-center justify-between px-2.5 sm:px-5 select-none"
          >
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              <span className="font-luxury text-[#FF1E4D] tracking-[0.12em] text-[10px] sm:text-xs font-black uppercase whitespace-nowrap shrink-0">
                TK STORYWORLD
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="font-display text-[11px] sm:text-sm font-semibold text-white truncate">
                {movie.title}
              </span>
              <span className="hidden md:inline text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap shrink-0">
                {movie.primaryCategory}
              </span>
              {movie.episodeNumber && (
                <>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-[10px] sm:text-xs text-[#F59E0B] tabular-nums whitespace-nowrap shrink-0">
                    S{String(movie.seasonNumber || 1).padStart(2, '0')} E
                    {String(movie.episodeNumber).padStart(2, '0')}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-1">
              {onOpenDownload && (
                <button
                  type="button"
                  onClick={() => onOpenDownload(movie)}
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[10px] sm:text-xs font-semibold text-emerald-300 transition-colors cursor-pointer"
                  title="Save Movie to Saved Movies or Download to Device"
                >
                  <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">
                    {isMovieInDeviceVault(movie.id) ? 'Saved in App' : 'Download'}
                  </span>
                </button>
              )}
              <button
                onClick={() => setShowShareCard((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] sm:text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Share Movie to WhatsApp or Copy Link"
              >
                <Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#F59E0B]" />
                <span className="hidden sm:inline">Share Movie</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 sm:p-2 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close Theatre"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Single Solid Bottom TK STORYWORLD Native Cinema Control Bar + Interactive Video Progress Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              contain: 'layout paint',
            }}
            className="absolute bottom-0 inset-x-0 z-20 bg-[#050505]/95 border-t border-white/15 px-2.5 sm:px-5 pt-1.5 pb-1.5 sm:py-2 flex flex-col gap-1.5 select-none"
          >
            {/* ROW 1: INTERACTIVE VIDEO PROGRESS BAR & SCRUBBER TIMELINE */}
            <div className="flex items-center gap-2.5 w-full">
              <span className="font-mono text-[10px] sm:text-xs text-white font-semibold tabular-nums shrink-0 min-w-[42px] sm:min-w-[52px]">
                {formatSec(displaySeconds)}
              </span>

              <div className="relative flex-1 h-5 flex items-center group cursor-pointer">
                {/* Base Track */}
                <div className="w-full h-1.5 sm:h-2 rounded-full bg-white/15 overflow-hidden relative">
                  {/* Buffered Bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-white/25 transition-all duration-300"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  {/* Active Watched Progress Fill */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#E11D48] via-[#FF1E4D] to-[#F59E0B]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                {/* Visible Scrubber Handle Thumb */}
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-[#E11D48] shadow-lg transition-transform group-hover:scale-125"
                  style={{ left: `${progressPct}%` }}
                />

                {/* Native Touch & Mouse Range Scrubber Input */}
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
                    const targetVal = Number(
                      (e.target as HTMLInputElement).value
                    );
                    setIsScrubbing(false);
                    setScrubPreviewSec(null);
                    seekToAbsoluteSeconds(targetVal);
                  }}
                  onTouchEnd={(e) => {
                    const targetVal = Number(
                      (e.target as HTMLInputElement).value
                    );
                    setIsScrubbing(false);
                    setScrubPreviewSec(null);
                    seekToAbsoluteSeconds(targetVal);
                  }}
                  onKeyUp={(e) => {
                    const targetVal = Number(
                      (e.target as HTMLInputElement).value
                    );
                    setIsScrubbing(false);
                    setScrubPreviewSec(null);
                    seekToAbsoluteSeconds(targetVal);
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>

              <span className="font-mono text-[10px] sm:text-xs text-slate-300 tabular-nums shrink-0 min-w-[42px] sm:min-w-[52px] text-right">
                {formatSec(totalDuration)}
              </span>
            </div>

            {/* ROW 2: PLAYBACK CONTROLS, QUALITY & FULLSCREEN */}
            <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
              {/* Left Native Playback Controls: Play/Pause, -15s, +15s, Mute, CDN & Quality */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={toggleNativePlayPause}
                  className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white cursor-pointer shrink-0"
                  title={playerPlaying ? 'Pause Movie' : 'Play Movie'}
                >
                  {playerPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => seekRelativeSeconds(-15)}
                  className="inline-flex items-center justify-center px-1.5 py-1 rounded bg-white/10 hover:bg-white/15 text-slate-200 text-[10px] font-mono cursor-pointer shrink-0"
                  title="Rewind 15 Seconds"
                >
                  -15s
                </button>

                <button
                  type="button"
                  onClick={() => seekRelativeSeconds(15)}
                  className="inline-flex items-center justify-center px-1.5 py-1 rounded bg-white/10 hover:bg-white/15 text-slate-200 text-[10px] font-mono cursor-pointer shrink-0"
                  title="Fast-Forward 15 Seconds"
                >
                  +15s
                </button>

                <button
                  type="button"
                  onClick={toggleNativeMute}
                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-white/10 hover:bg-white/15 text-slate-200 cursor-pointer shrink-0"
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>

                <div className="flex items-center gap-1 ml-0.5 sm:ml-1">
                  <button
                    onClick={() => setPlayerServer('nocookie')}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[9.5px] sm:text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      playerServer === 'nocookie'
                        ? 'bg-[#E11D48] text-white'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                    title="Fast Privacy CDN Server (Recommended)"
                  >
                    CDN 1
                  </button>
                  <button
                    onClick={() => setPlayerServer('standard')}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[9.5px] sm:text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      playerServer === 'standard'
                        ? 'bg-[#E11D48] text-white'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                    title="Standard CDN Server"
                  >
                    CDN 2
                  </button>
                  <button
                    onClick={() => {
                      const nextQ =
                        streamQuality === 'hd720'
                          ? 'large'
                          : streamQuality === 'large'
                          ? 'hd1080'
                          : 'hd720';
                      setStreamQuality(nextQ);
                      applyLiveStreamQuality(nextQ);
                    }}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9.5px] sm:text-[10px] font-semibold cursor-pointer whitespace-nowrap"
                    title="Live Audio/Video Anti-Crack Stream Stabilizer (Changes Quality Without Reloading)"
                  >
                    <span>
                      {streamQuality === 'hd720'
                        ? '⚡ 720p'
                        : streamQuality === 'large'
                        ? '🛡️ 480p'
                        : '🎬 1080p'}
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {nextBingeMovie && (
                  <button
                    onClick={triggerBingeNext}
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-[#E11D48] hover:bg-[#BE123C] text-white text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap"
                    title={`Binge Next: ${nextBingeMovie.title}`}
                  >
                    <FastForward className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span className="hidden sm:inline">Next Movie</span>
                    <span className="sm:hidden">Next</span>
                  </button>
                )}
                <button
                  onClick={cycleScreenFitMode}
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  title="Toggle Widescreen Fill Mode"
                >
                  <span>{screenFitLabel}</span>
                </button>
                <button
                  onClick={() => void toggleFullscreen()}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[10px] sm:text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                  title="Fullscreen Cinema"
                >
                  <Maximize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>{isMobileTheatreExpanded ? 'Exit Full' : 'Full'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* AUTO-BINGE NEXT OVERLAY */}
          {bingeCountdown !== null && nextBingeMovie && (
            <div className="absolute inset-0 bg-[#050505]/95 flex flex-col items-center justify-center p-6 text-center z-30">
              <div className="w-12 h-12 rounded-full bg-[#E11D48]/25 border border-[#E11D48]/50 flex items-center justify-center mb-3 text-[#E11D48]">
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-1">
                🔥 Playing Next in {bingeCountdown}s · Auto-Binge
              </div>
              <h3 className="font-display text-lg sm:text-xl font-bold text-white max-w-md line-clamp-1 mb-1">
                {nextBingeMovie.title}
              </h3>
              <p className="text-xs text-slate-300 mb-4 max-w-sm line-clamp-1">
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
        </div>

        {/* Scrollable Details, Episodes & Community Viewport below the pinned video player */}
        <div className="overflow-y-auto flex-1">
          {/* INSTANT BINGE STRIP & WHATSAPP VIRAL REFERRAL BAR (Right Under Player) */}
          <div className="bg-[#080A0F] border-b border-white/10 px-4 sm:px-8 py-4 space-y-4">
            {/* Viral WhatsApp Share & Live Audience Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-[#0E131F] border border-white/10 p-3 sm:px-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {liveWatchersCount.toLocaleString()} Watching Now
                </span>
                <span className="text-xs text-slate-200 truncate">
                  {whatsappSharesCount > 0
                    ? `👑 VIP Sharer Unlocked (${whatsappSharesCount} friend${whatsappSharesCount === 1 ? '' : 's'} invited!)`
                    : 'Enjoying this movie? Bring your friends from WhatsApp to watch free!'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={whatsappShareHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={recordWhatsAppShare}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold shadow-md transition-transform hover:scale-105 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 fill-current" />
                  <span>Invite Friends on WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={handleQuickCopyLink}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white cursor-pointer"
                >
                  {quickCopiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#F59E0B]" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Immediate "Watch Next (Binge 2-3 Movies)" Strip — Staggered until stream buffer is settled */}
            {isStreamSettled && relatedMovies.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#E11D48]">
                      🔥 Watch Next · Keep Bingeing
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      Tap any movie below to play immediately inside this theatre
                    </span>
                  </div>
                  {nextBingeMovie && (
                    <button
                      onClick={() => onSelectMovie(nextBingeMovie, true)}
                      className="text-xs font-semibold text-[#F59E0B] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      <span>Play Next Automatically</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                  {relatedMovies.slice(0, 6).map((rel, idx) => (
                    <button
                      key={rel.id}
                      onClick={() => onSelectMovie(rel, true)}
                      className="group relative w-48 sm:w-56 shrink-0 text-left rounded-xl overflow-hidden bg-[#11141D] border border-white/10 hover:border-[#E11D48] transition-all cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-video w-full bg-black overflow-hidden">
                        <CinemaPosterImage
                          src={rel.thumbnailUrl}
                          fallbackVideoId={rel.youtubeVideoId}
                          alt={rel.title}
                          category={rel.primaryCategory}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded bg-black/80 text-[9.5px] font-bold text-[#F59E0B]">
                          Up Next #{idx + 1}
                        </span>
                        <span className="absolute bottom-1.5 right-2 font-mono text-[10px] text-slate-200 bg-black/75 px-1.5 py-0.5 rounded">
                          {rel.durationFormatted}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <div className="font-display text-xs font-semibold text-white group-hover:text-[#F59E0B] truncate">
                          {rel.title}
                        </div>
                        <div className="text-[10px] text-rose-400 font-mono mt-0.5">
                          🔥{' '}
                          {rel.viewCount >= 1000000
                            ? `${(rel.viewCount / 1000000).toFixed(1)}M`
                            : `${Math.round((rel.viewCount || 850000) / 1000)}K`}{' '}
                          views · {rel.primaryCategory}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Movie Synopsis, Likes, Ratings & Comment Threads */}
          <div className="p-4 sm:p-8 space-y-7 sm:space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {movie.hookTag && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/50 text-rose-300 font-bold text-[11px] shadow-sm">
                      {movie.hookTag}
                    </span>
                  )}
                  <span className="text-[#F59E0B] font-medium">
                    {movie.primaryCategory}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-rose-400 font-semibold">
                    🔥 {movie.viewCount ? (movie.viewCount >= 1000000 ? `${(movie.viewCount / 1000000).toFixed(1)}M` : `${Math.round(movie.viewCount / 1000)}K`) : '850K'} Views
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    💬 {movie.commentsCount ? (movie.commentsCount >= 1000 ? `${(movie.commentsCount / 1000).toFixed(1)}K` : movie.commentsCount) : (engagement.commentsCount || 1200)} Comments
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-[#F59E0B]">
                    ★ {engagement.averageRating} ({engagement.ratingsCount}{' '}
                    ratings)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {movie.durationFormatted}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Studio: {movie.channelTitle}</span>
                </div>

                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {movie.title}
                </h2>

                <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-[68ch]">
                  {movie.synopsis}
                </p>

                {/* Primary Viewer Actions: Binge Next, Download Movie, Love/Like, Watchlist, WhatsApp Share, Copy Link */}
                <div className="pt-3 flex flex-wrap items-center gap-2.5">
                  {onOpenDownload && (
                    <button
                      type="button"
                      onClick={() => onOpenDownload(movie)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg transition-all cursor-pointer"
                      title="Download Movie to Mobile Phone or Computer"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {isMovieInDeviceVault(movie.id)
                          ? '✓ Downloaded on Device'
                          : 'Download Movie'}
                      </span>
                    </button>
                  )}

                  {nextBingeMovie && (
                    <button
                      onClick={triggerBingeNext}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/50 bg-gradient-to-r from-red-600/30 to-amber-600/25 text-white text-xs sm:text-sm font-bold hover:border-rose-400 transition-all cursor-pointer shadow-md"
                      title={`Binge Next: ${nextBingeMovie.title}`}
                    >
                      <FastForward className="w-4 h-4 text-amber-400" />
                      <span>⚡ Binge Next Movie</span>
                    </button>
                  )}

                  <button
                    onClick={handleToggleLike}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      engagement.userLiked
                        ? 'bg-[#E11D48] border-[#E11D48] text-white shadow-lg'
                        : 'bg-white/5 border-white/15 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        engagement.userLiked ? 'fill-current' : ''
                      }`}
                    />
                    <span className="font-mono tabular-nums">
                      {engagement.userLiked ? 'Loved' : 'Love This Movie'} ·{' '}
                      {engagement.likesCount.toLocaleString()}
                    </span>
                  </button>

                  <button
                    onClick={() => onToggleWatchlist(movie.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inWatchlist
                        ? 'bg-white/15 border-white/30 text-white'
                        : 'bg-transparent border-white/15 text-slate-300 hover:text-white hover:border-white/30'
                    }`}
                  >
                    {inWatchlist ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Saved in Watchlist</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4" />
                        <span>Add to Watchlist</span>
                      </>
                    )}
                  </button>

                  {/* Direct 1-Tap Share to WhatsApp */}
                  <a
                    href={whatsappShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs sm:text-sm font-semibold shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 fill-current" />
                    <span>Share to WhatsApp</span>
                  </a>

                  {/* Direct 1-Tap Copy Link */}
                  <button
                    type="button"
                    onClick={handleQuickCopyLink}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      quickCopiedLink
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                        : 'bg-white/10 hover:bg-white/15 border-white/20 text-white'
                    }`}
                  >
                    {quickCopiedLink ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-[#F59E0B]" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  {/* Toggle Branded Share Card */}
                  <button
                    type="button"
                    onClick={() => setShowShareCard((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showShareCard
                        ? 'bg-[#F59E0B] border-[#F59E0B] text-black font-semibold'
                        : 'bg-transparent border-white/15 text-slate-300 hover:text-white hover:border-white/30'
                    }`}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Share Card</span>
                  </button>

                  {resumeSeconds > 15 && (
                    <button
                      onClick={() => {
                        onProgressUpdate(
                          movie.id,
                          0,
                          movie.durationSeconds || 600
                        );
                        setCurrentTimestamp(0);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Restart Movie</span>
                    </button>
                  )}
                </div>

                {/* Expandable Branded Share Movie Card inside Modal */}
                {showShareCard && (
                  <div className="pt-2">
                    <BrandedShareCard
                      movie={movie}
                      averageRating={engagement.averageRating}
                      likesCount={engagement.likesCount}
                      onClose={() => setShowShareCard(false)}
                    />
                  </div>
                )}
              </div>

              {/* Right Column: Clean Cinema Summary & Viral Addiction Metrics */}
              <div className="rounded-xl bg-[#11141D] border border-white/10 p-5 space-y-3.5 text-xs">
                <div className="font-display text-sm font-semibold text-white pb-2 border-b border-white/10 flex items-center justify-between">
                  <span>Audience Score & Impact</span>
                  {movie.hookTag && (
                    <span className="text-[10px] font-bold text-rose-300 bg-red-950/60 border border-red-500/40 px-2 py-0.5 rounded">
                      {movie.hookTag}
                    </span>
                  )}
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Total Views</span>
                  <span className="font-mono text-rose-400 font-bold tabular-nums">
                    🔥 {movie.viewCount ? (movie.viewCount >= 1000000 ? `${(movie.viewCount / 1000000).toFixed(1)}M` : `${Math.round(movie.viewCount / 1000)}K`) : '850K'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Comment Debates</span>
                  <span className="font-mono text-slate-200 font-semibold tabular-nums">
                    💬 {movie.commentsCount ? (movie.commentsCount >= 1000 ? `${(movie.commentsCount / 1000).toFixed(1)}K` : movie.commentsCount) : (engagement.commentsCount || 1200).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Viewer Rating</span>
                  <span className="font-mono text-[#F59E0B] font-semibold tabular-nums">
                    ★ {engagement.averageRating} / 5.0
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Viewer Loves</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    ♥ {engagement.likesCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Production Studio</span>
                  <span className="text-slate-200 font-medium text-right truncate max-w-[140px]">
                    {movie.channelTitle}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Runtime</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {movie.durationFormatted}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Your Progress</span>
                  <span className="font-mono text-emerald-400 tabular-nums">
                    {formatSec(currentTimestamp)} / {movie.durationFormatted}
                  </span>
                </div>

                {/* Audience Buzz Box */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <span>⚡ Viewer Obsession Rating: 99%</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1.5 text-[11px] text-slate-300 italic leading-relaxed">
                    <p>"The boardroom scene had my jaw on the floor! Absolute peak satisfaction."</p>
                    <div className="text-[10px] text-slate-400 not-italic flex justify-between">
                      <span>— Top Verified Reviewer</span>
                      <span className="text-rose-400">♥ 3.4k likes</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Series Seasons & Episodes Section */}
            {seriesEpisodes.length > 0 && (
              <div className="pt-6 border-t border-white/10 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">
                      {parentSeries
                        ? `${parentSeries.title} — Episodes`
                        : 'Series Episodes'}
                    </h3>
                    {parentSeries && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {parentSeries.synopsis}
                      </p>
                    )}
                  </div>

                  {availableSeasons.length > 1 && (
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-[#11141D] border border-white/10">
                      {availableSeasons.map((seasonNum) => (
                        <button
                          key={seasonNum}
                          onClick={() => setSelectedSeason(seasonNum)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            selectedSeason === seasonNum
                              ? 'bg-[#E11D48] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Season {seasonNum}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {seriesEpisodes
                    .filter((ep) => (ep.seasonNumber || 1) === selectedSeason)
                    .map((ep) => {
                      const isCurrent = ep.id === movie.id;
                      return (
                        <button
                          key={ep.id}
                          onClick={() => onSelectMovie(ep, true)}
                          className={`group text-left rounded-xl p-3 border transition-all cursor-pointer flex gap-3.5 items-center ${
                            isCurrent
                              ? 'bg-[#181C28] border-[#E11D48]'
                              : 'bg-[#11141D] border-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="relative w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-black">
                            <CinemaPosterImage
                              src={ep.thumbnailUrl}
                              fallbackVideoId={ep.youtubeVideoId}
                              alt={ep.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white fill-current" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[11px] text-[#F59E0B] tabular-nums">
                              S{String(ep.seasonNumber || 1).padStart(2, '0')} · E
                              {String(ep.episodeNumber || 1).padStart(2, '0')} ·{' '}
                              {ep.durationFormatted}
                            </div>
                            <div className="font-display text-sm font-semibold text-white truncate mt-0.5">
                              {ep.title}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* VIEWER RATINGS, REACTIONS & COMMENT THREADS */}
            <div className="pt-6 border-t border-white/10 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-5 h-5 text-[#F59E0B]" />
                  <h3 className="font-display text-lg font-bold text-white">
                    Viewer Ratings & Comments ({comments.length})
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  Average Score: ★ {engagement.averageRating} / 5.0
                </span>
              </div>

              {/* Rate & Comment Form */}
              <form
                onSubmit={handleSubmitComment}
                className="rounded-xl bg-[#11141D] border border-white/10 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* 1-5 Star Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-300">
                      Your Rating:
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSelectedRating(star)}
                          className="p-1 cursor-pointer transition-transform hover:scale-110"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              star <= selectedRating
                                ? 'text-[#F59E0B] fill-current'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Reaction Selector */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {REACTION_OPTIONS.map((react) => (
                      <button
                        key={react}
                        type="button"
                        onClick={() => setSelectedReaction(react)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          selectedReaction === react
                            ? 'bg-[#F59E0B] text-black font-semibold'
                            : 'bg-[#07090E] text-slate-300 border border-white/10 hover:border-white/25'
                        }`}
                      >
                        {react}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Share your thoughts on this love story..."
                    className="flex-1 px-4 py-3 rounded-xl bg-[#07090E] border border-white/15 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {submittingComment ? 'Posting...' : 'Post Comment'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Comment Thread List */}
              {comments.length === 0 ? (
                <div className="rounded-xl bg-[#0E1118] border border-white/5 p-6 text-center text-xs text-slate-400">
                  Be the first viewer to rate and leave a comment on this movie!
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl bg-[#0E1118] border border-white/10 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-semibold text-white">
                            {c.userDisplayName}
                          </span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="font-mono text-[#F59E0B] tabular-nums">
                            {'★'.repeat(c.rating)}
                            {'☆'.repeat(Math.max(0, 5 - c.rating))}
                          </span>
                          {c.reaction && (
                            <>
                              <span
                                aria-hidden="true"
                                className="text-slate-600"
                              >
                                ·
                              </span>
                              <span className="text-emerald-400 font-medium">
                                {c.reaction}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                        {c.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Related AI Movies in This Genre */}
            {relatedMovies.length > 0 && (
              <div className="pt-6 border-t border-white/10 space-y-4">
                <h3 className="font-display text-lg font-bold text-white">
                  More in {movie.primaryCategory}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {relatedMovies.map((rel) => (
                    <button
                      key={rel.id}
                      onClick={() => onSelectMovie(rel, true)}
                      className="group text-left rounded-xl overflow-hidden bg-[#11141D] border border-white/10 hover:border-white/25 transition-all cursor-pointer"
                    >
                      <div className="aspect-video w-full overflow-hidden bg-black">
                        <CinemaPosterImage
                          src={rel.thumbnailUrl}
                          fallbackVideoId={rel.youtubeVideoId}
                          alt={rel.title}
                          category={rel.primaryCategory}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                      <div className="p-3">
                        <div className="font-display text-xs sm:text-sm font-semibold text-white truncate">
                          {rel.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                          {rel.durationFormatted} · {rel.channelTitle}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

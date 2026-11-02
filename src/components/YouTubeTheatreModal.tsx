import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
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

  const [streamError, setStreamError] = useState<string | null>(
    !movie.isEmbeddable || movie.playbackStatus !== 'active'
      ? 'This stream is temporarily unavailable.'
      : null
  );

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

  const relatedMovies = allMovies
    .filter(
      (m) =>
        m.id !== movie.id &&
        (m.primaryCategory === movie.primaryCategory ||
          m.secondaryCategories.includes(movie.primaryCategory))
    )
    .slice(0, 4);

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

  // Load Likes, Ratings & Comments for this movie
  useEffect(() => {
    const loadEngagement = async () => {
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
    };
    void loadEngagement();
  }, [movie.id, userId]);

  useEffect(() => {
    setHasStarted(initialAutoPlay);
    setPlayerPlaying(initialAutoPlay);
    setCurrentTimestamp(resumeSeconds);
    setTotalDuration(movie.durationSeconds || 600);
    setSelectedSeason(movie.seasonNumber || 1);
    setStreamError(
      !movie.isEmbeddable || movie.playbackStatus !== 'active'
        ? 'This stream is temporarily unavailable.'
        : null
    );
  }, [movie.id, movie.youtubeVideoId, initialAutoPlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!hasStarted || streamError) {
      return;
    }

    let isCancelled = false;

    const initPlayer = () => {
      if (isCancelled || !window.YT || !window.YT.Player) return;

      if (
        playerRef.current &&
        typeof playerRef.current.destroy === 'function'
      ) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }

      playerRef.current = new window.YT.Player(playerContainerId, {
        videoId: movie.youtubeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          showinfo: 0,
          iv_load_policy: 3,
          fs: 0,
          disablekb: 1,
          playsinline: 1,
          start: resumeSeconds > 10 ? Math.floor(resumeSeconds) : 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            try {
              const dur = Math.floor(event.target.getDuration() || 0);
              if (dur > 0) setTotalDuration(dur);
              event.target.playVideo();
              setPlayerPlaying(true);
            } catch {
              // ignore autoplay block
            }
          },
          onStateChange: (event: any) => {
            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (event.data === 1) {
              setPlayerPlaying(true);
              if (progressTimerRef.current) {
                window.clearInterval(progressTimerRef.current);
              }
              progressTimerRef.current = window.setInterval(() => {
                if (
                  playerRef.current &&
                  typeof playerRef.current.getCurrentTime === 'function'
                ) {
                  const cur = Math.floor(
                    playerRef.current.getCurrentTime() || 0
                  );
                  const dur =
                    Math.floor(playerRef.current.getDuration() || 0) ||
                    movie.durationSeconds ||
                    600;
                  setCurrentTimestamp(cur);
                  if (dur > 0) setTotalDuration(dur);
                  if (cur > 0) {
                    onProgressUpdate(movie.id, cur, dur);
                  }
                }
              }, 1000);
            } else if (event.data === 2) {
              setPlayerPlaying(false);
              if (
                playerRef.current &&
                typeof playerRef.current.getCurrentTime === 'function'
              ) {
                const cur = Math.floor(
                  playerRef.current.getCurrentTime() || 0
                );
                const dur =
                  Math.floor(playerRef.current.getDuration() || 0) ||
                  movie.durationSeconds ||
                  600;
                if (cur > 0) {
                  onProgressUpdate(movie.id, cur, dur);
                }
              }
            } else if (event.data === 0) {
              setPlayerPlaying(false);
              onProgressUpdate(
                movie.id,
                movie.durationSeconds || 600,
                movie.durationSeconds || 600
              );
              if (nextBingeMovie) {
                setBingeCountdown(5);
              }
            }
          },
          onError: (event: any) => {
            const errorCode = Number(event.data);
            const isEmbedRestriction = errorCode === 101 || errorCode === 150;
            setStreamError(
              'This movie stream is currently restricted or unavailable. Please choose another title below.'
            );
            onPlaybackError(
              movie.id,
              isEmbedRestriction ? 'embed_restricted' : 'unavailable'
            );
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.getElementById(
        'aetheria-stream-api-script'
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'aetheria-stream-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };
    }

    return () => {
      isCancelled = true;
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
      if (
        playerRef.current &&
        typeof playerRef.current.destroy === 'function'
      ) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [hasStarted, movie.id, movie.youtubeVideoId, streamError]);

  const togglePlayPause = () => {
    if (!hasStarted) {
      setHasStarted(true);
      setPlayerPlaying(true);
      return;
    }
    if (!playerRef.current) return;
    try {
      if (playerPlaying) {
        playerRef.current.pauseVideo();
        setPlayerPlaying(false);
      } else {
        playerRef.current.playVideo();
        setPlayerPlaying(true);
      }
    } catch {
      // ignore
    }
  };

  const handleSeek = (newSeconds: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, Math.floor(newSeconds)));
    setCurrentTimestamp(clamped);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(clamped, true);
        playerRef.current.playVideo();
        setPlayerPlaying(true);
      } catch {
        // ignore
      }
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    try {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch {
      // ignore
    }
  };

  const [isMobileTheatreExpanded, setIsMobileTheatreExpanded] = useState(false);
  const [screenFitMode, setScreenFitMode] = useState<'fill' | 'zoom' | 'fit'>('fill');

  const cycleScreenFitMode = () => {
    setScreenFitMode((prev) =>
      prev === 'fill' ? 'zoom' : prev === 'zoom' ? 'fit' : 'fill'
    );
  };

  const screenFitScaleClass =
    screenFitMode === 'zoom'
      ? 'scale-[1.34]'
      : screenFitMode === 'fill'
      ? 'scale-[1.18]'
      : 'scale-[1.04]';

  const screenFitLabel =
    screenFitMode === 'zoom'
      ? 'Ultrawide Fill'
      : screenFitMode === 'fill'
      ? 'Complete Screen'
      : '16:9 Standard';

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
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progressPct =
    totalDuration > 0
      ? Math.min(100, Math.max(0, (currentTimestamp / totalDuration) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/95 backdrop-blur-md p-0 sm:p-6 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
    >
      <div className="relative w-full max-w-5xl h-[100dvh] sm:h-auto sm:max-h-[94vh] sm:rounded-2xl bg-[#0B0D13] border-0 sm:border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Top Cinema Bar */}
        <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-white/10 bg-[#07080C] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="brand-luxury-red text-[11px] sm:text-xs font-black uppercase whitespace-nowrap shrink-0">
              TK STORYWORLD
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="font-display text-xs sm:text-sm font-semibold text-white truncate">
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
                <span className="font-mono text-xs text-[#F59E0B] tabular-nums whitespace-nowrap shrink-0">
                  S{String(movie.seasonNumber || 1).padStart(2, '0')} E
                  {String(movie.episodeNumber).padStart(2, '0')}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setShowShareCard((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
              title="Share Movie to WhatsApp or Copy Link"
            >
              <Share2 className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="hidden sm:inline">Share Movie</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close Theatre"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sticky 16:9 Cinema Video Player (Stays pinned at top on phones while scrolling comments/episodes below!) */}
        <div
          ref={videoViewportRef}
          className={`relative w-full aspect-video bg-black overflow-hidden select-none group shrink-0 border-b border-white/10 ${
            isMobileTheatreExpanded ? 'fixed inset-0 z-50 aspect-auto h-full' : ''
          }`}
        >
          {hasStarted && !streamError ? (
            <>
              {/* Cropped & pointer-locked stream frame so external chrome/logos never appear and complete screen is filled */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`w-full h-full ${screenFitScaleClass} origin-center transition-transform duration-200`}>
                  <div id={playerContainerId} className="w-full h-full" />
                </div>
              </div>

              {/* Top-Left Luxury Red TK STORYWORLD Screen Watermark */}
              <div className="absolute top-3 left-3.5 sm:top-4 sm:left-5 z-20 pointer-events-none">
                <span className="brand-luxury-red text-[11px] sm:text-sm font-black uppercase">
                  TK STORYWORLD
                </span>
              </div>

              {/* Clickable center play/pause surface */}
              <div
                onClick={togglePlayPause}
                className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center"
              >
                {!playerPlaying && (
                  <div className="inset-0 absolute bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-6 text-center space-y-2.5">
                    <div className="brand-luxury-red text-xs font-black uppercase">
                      TK STORYWORLD CINEMA
                    </div>
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-2xl transform hover:scale-105 transition-transform">
                      <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current ml-0.5" />
                    </div>
                    <div className="font-display text-sm sm:text-base font-bold text-white line-clamp-1">
                      Paused · {movie.title}
                    </div>
                    <div className="text-xs text-slate-300">
                      Tap anywhere to resume movie
                    </div>
                  </div>
                )}
              </div>

              {/* Custom TK STORYWORLD Touch-Friendly Cinema Controls Bar */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-6 pb-2.5 sm:pb-3.5 px-3 sm:px-6 space-y-2"
              >
                {/* Interactive Timeline Scrubber (Taller touch target for mobile fingers) */}
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickRatio = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width)
                    );
                    handleSeek(clickRatio * totalDuration);
                  }}
                  className="w-full py-1.5 cursor-pointer"
                >
                  <div className="w-full h-2 rounded-full bg-white/25 hover:h-2.5 transition-all relative overflow-hidden">
                    <div
                      className="h-full bg-[#E11D48] rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Transport Buttons & Time */}
                <div className="flex items-center justify-between gap-2 sm:gap-4 text-xs text-white">
                  <div className="flex items-center gap-2 sm:gap-3.5">
                    <button
                      onClick={togglePlayPause}
                      className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                      title={playerPlaying ? 'Pause' : 'Play'}
                    >
                      {playerPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>

                    <button
                      onClick={() => handleSeek(currentTimestamp - 10)}
                      className="p-2 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"
                      title="Rewind 10s"
                    >
                      <Rewind className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleSeek(currentTimestamp + 10)}
                      className="p-2 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"
                      title="Forward 10s"
                    >
                      <FastForward className="w-4 h-4" />
                    </button>

                    <button
                      onClick={toggleMute}
                      className="p-2 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>

                    <span className="font-mono text-[11px] sm:text-xs tabular-nums text-slate-200">
                      {formatSec(currentTimestamp)} / {formatSec(totalDuration)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {nextBingeMovie && (
                      <button
                        onClick={triggerBingeNext}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#E11D48]/80 hover:bg-[#E11D48] text-white text-[11px] font-semibold transition-all cursor-pointer shadow-md"
                        title={`Binge Next: ${nextBingeMovie.title}`}
                      >
                        <FastForward className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Next Movie</span>
                      </button>
                    )}
                    <button
                      onClick={cycleScreenFitMode}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-medium cursor-pointer"
                      title="Toggle Widescreen Fill Mode"
                    >
                      <span>{screenFitLabel}</span>
                    </button>
                    <button
                      onClick={() => void toggleFullscreen()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold cursor-pointer"
                      title="Fullscreen Cinema"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="sm:hidden">Full Screen</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* AUTO-BINGE NEXT OVERLAY */}
              {bingeCountdown !== null && nextBingeMovie && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 animate-in fade-in duration-200">
                  <div className="w-12 h-12 rounded-full bg-[#E11D48]/25 border border-[#E11D48]/50 flex items-center justify-center mb-3 text-[#E11D48] animate-pulse">
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
            </>
          ) : streamError ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#131620] to-[#07080C]">
              <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-[#F59E0B] mb-3" />
              <h3 className="font-display text-lg sm:text-xl font-bold text-white mb-1.5">
                Stream Currently Unavailable
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                {streamError}
              </p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <CinemaPosterImage
                src={movie.backdropUrl}
                fallbackVideoId={movie.youtubeVideoId}
                alt={movie.title}
                category={movie.primaryCategory}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D13] via-black/50 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <button
                  onClick={() => {
                    setHasStarted(true);
                    setPlayerPlaying(true);
                  }}
                  className="group flex items-center gap-3 px-6 sm:px-7 py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm sm:text-base font-semibold shadow-lg transition-transform duration-150 hover:scale-105 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {resumeSeconds > 15
                      ? `Resume Movie (${formatSec(resumeSeconds)})`
                      : 'Play Full Movie'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Details, Episodes & Community Viewport below the pinned video player */}
        <div className="overflow-y-auto flex-1">
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

                {/* Primary Viewer Actions: Binge Next, Love/Like, Watchlist, WhatsApp Share, Copy Link */}
                <div className="pt-3 flex flex-wrap items-center gap-2.5">
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
                        handleSeek(0);
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

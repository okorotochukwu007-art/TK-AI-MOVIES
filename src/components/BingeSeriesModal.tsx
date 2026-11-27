import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Clock,
  FastForward,
  ListVideo,
  Maximize2,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Star,
  X,
} from 'lucide-react';
import {
  MovieItem,
  MovieSeries,
  WatchProgressItem,
} from '../types/cinema.ts';
import {
  buildUnifiedEmbedUrl,
  resolveMovieSource,
} from '../utils/videoSource.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

interface BingeSeriesModalProps {
  series: MovieSeries;
  allMovies: MovieItem[];
  progressMap: Map<string, WatchProgressItem>;
  watchlistIds: Set<string>;
  onClose: () => void;
  onProgressUpdate: (
    movieId: string,
    progressSeconds: number,
    durationSeconds: number
  ) => void;
  onToggleWatchlist: (movieId: string) => void;
  onOpenInFullTheatre: (episode: MovieItem) => void;
}

function formatTotalRuntime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

function formatViewsCompact(views?: number): string {
  if (!views || views <= 0) return '120K views';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

export const BingeSeriesModal: React.FC<BingeSeriesModalProps> = ({
  series,
  allMovies,
  progressMap,
  watchlistIds,
  onClose,
  onProgressUpdate,
  onToggleWatchlist,
  onOpenInFullTheatre,
}) => {
  // Derive sequentially ordered episodes from the existing movies state array
  const episodes = useMemo(
    () =>
      allMovies
        .filter((m) => m.seriesId === series.id)
        .sort(
          (a, b) =>
            (a.seasonNumber || 1) - (b.seasonNumber || 1) ||
            (a.episodeNumber || 1) - (b.episodeNumber || 1)
        ),
    [allMovies, series.id]
  );

  // Pick initial episode: resume last partially watched episode, or advance past completed episode, or Episode 1
  const initialIndex = useMemo(() => {
    if (episodes.length === 0) return 0;
    let latestIdx = -1;
    let latestTs = 0;
    let latestPct = 0;
    episodes.forEach((ep, idx) => {
      const prog = progressMap.get(ep.id);
      if (prog && prog.progressSeconds > 15) {
        const ts = new Date(prog.lastWatchedAt).getTime() || 0;
        const pct =
          prog.durationSeconds > 0
            ? Math.round((prog.progressSeconds / prog.durationSeconds) * 100)
            : 0;
        if (ts >= latestTs) {
          latestTs = ts;
          latestIdx = idx;
          latestPct = pct;
        }
      }
    });
    if (latestIdx >= 0) {
      if (latestPct >= 92 && latestIdx + 1 < episodes.length) {
        return latestIdx + 1;
      }
      return latestIdx;
    }
    return 0;
  }, [episodes, progressMap]);

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(true);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [seasonFilter, setSeasonFilter] = useState<number | 'all'>('all');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const progressReportedSecRef = useRef<number>(0);

  // Sync currentIndex if episodes change cleanly
  useEffect(() => {
    setCurrentIndex((prev) => {
      if (episodes.length === 0) return 0;
      return Math.min(prev, episodes.length - 1);
    });
  }, [episodes.length]);

  const currentEpisode: MovieItem | null = episodes[currentIndex] || null;
  const prevEpisode: MovieItem | null =
    currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEpisode: MovieItem | null =
    currentIndex >= 0 && currentIndex + 1 < episodes.length
      ? episodes[currentIndex + 1]
      : null;

  const seasons = useMemo(() => {
    const nums = Array.from(
      new Set(episodes.map((ep) => ep.seasonNumber || 1))
    ).sort((a, b) => a - b);
    return nums;
  }, [episodes]);

  const filteredQueue = useMemo(() => {
    return episodes
      .map((ep, idx) => ({ ep, idx }))
      .filter(
        ({ ep }) =>
          seasonFilter === 'all' || (ep.seasonNumber || 1) === seasonFilter
      );
  }, [episodes, seasonFilter]);

  const totalRuntimeSeconds = useMemo(
    () => episodes.reduce((sum, ep) => sum + (ep.durationSeconds || 0), 0),
    [episodes]
  );

  const totalViews =
    series.totalViews ||
    episodes.reduce((sum, ep) => sum + (ep.viewCount || 0), 0);

  const goToEpisode = useCallback((idx: number) => {
    setUpNextCountdown(null);
    progressReportedSecRef.current = 0;
    setCurrentIndex(idx);
  }, []);

  // Lock background scroll & handle keyboard shortcuts (Escape to close)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Up-Next sequential auto-advance countdown
  useEffect(() => {
    if (upNextCountdown === null) return;
    if (upNextCountdown <= 0) {
      setUpNextCountdown(null);
      if (nextEpisode) {
        goToEpisode(currentIndex + 1);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setUpNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, nextEpisode, currentIndex, goToEpisode]);

  // Listen for YouTube IFrame API postMessage events (state === 0 ended + currentTime progress)
  useEffect(() => {
    if (!currentEpisode) return;
    const source = resolveMovieSource(currentEpisode);
    if (source.platform !== 'youtube') return;

    const sendListeningHandshake = () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'listening', id: currentEpisode.id }),
          '*'
        );
      } catch {
        // ignore cross-origin handshake errors
      }
    };

    const handshakeTimer = window.setInterval(sendListeningHandshake, 1500);

    const handleMessage = (event: MessageEvent) => {
      if (
        typeof event.origin === 'string' &&
        !event.origin.includes('youtube') &&
        !event.origin.includes('youtube-nocookie')
      ) {
        return;
      }
      let payload: any = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== 'object') return;

      // YouTube ended event (state === 0)
      const playerState =
        payload.event === 'onStateChange'
          ? payload.info
          : payload.event === 'infoDelivery' &&
            typeof payload.info?.playerState === 'number'
          ? payload.info.playerState
          : null;

      if (playerState === 0) {
        onProgressUpdate(
          currentEpisode.id,
          currentEpisode.durationSeconds || 600,
          currentEpisode.durationSeconds || 600
        );
        if (autoPlayNext && nextEpisode) {
          setUpNextCountdown(5);
        }
      }

      // Track watch progress periodically (~every 15s)
      if (
        payload.event === 'infoDelivery' &&
        typeof payload.info?.currentTime === 'number'
      ) {
        const sec = Math.floor(payload.info.currentTime);
        const dur =
          typeof payload.info?.duration === 'number' && payload.info.duration > 0
            ? Math.floor(payload.info.duration)
            : currentEpisode.durationSeconds || 600;
        if (sec >= progressReportedSecRef.current + 15) {
          progressReportedSecRef.current = sec;
          onProgressUpdate(currentEpisode.id, sec, dur);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.clearInterval(handshakeTimer);
      window.removeEventListener('message', handleMessage);
    };
  }, [currentEpisode, autoPlayNext, nextEpisode, onProgressUpdate]);

  const embedUrl = useMemo(() => {
    if (!currentEpisode) return '';
    const saved = progressMap.get(currentEpisode.id);
    const resumeSec =
      saved &&
      saved.durationSeconds > 0 &&
      saved.progressSeconds / saved.durationSeconds < 0.92
        ? Math.max(0, Math.floor(saved.progressSeconds))
        : 0;
    const resolvedSource = resolveMovieSource(currentEpisode);
    return buildUnifiedEmbedUrl({
      platform: resolvedSource.platform,
      videoId: resolvedSource.videoId,
      autoPlay: true,
      startOffsetSec: resumeSec,
    });
  }, [currentEpisode, progressMap]);

  const inWatchlist = currentEpisode ? watchlistIds.has(currentEpisode.id) : false;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 lg:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Binge Series: ${series.title}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1280px] max-h-[95vh] rounded-t-2xl sm:rounded-2xl bg-[#090B10] border border-white/15 overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-white/10 bg-[#0B0E16] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 text-[#E11D48] font-semibold">
                <ListVideo className="w-3.5 h-3.5" />
                <span>Binge Playlist</span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[#F59E0B] font-medium">
                {series.genreTag || series.primaryCategory}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-200">
                {episodes.length}{' '}
                {episodes.length === 1 ? 'Episode' : 'Episodes'}
              </span>
              {totalRuntimeSeconds > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums">
                    {formatTotalRuntime(totalRuntimeSeconds)} total
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex items-center gap-1 font-mono tabular-nums text-[#F59E0B]">
                <Star className="w-3 h-3 fill-current" />
                {(series.rating || 4.8).toFixed(1)}
              </span>
              <span aria-hidden="true" className="text-slate-600 hidden md:inline">·</span>
              <span className="hidden md:inline font-mono tabular-nums text-slate-300">
                {formatViewsCompact(totalViews)}
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate mt-0.5">
              {series.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAutoPlayNext((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoPlayNext
                  ? 'bg-[#E11D48]/15 border-[#E11D48]/50 text-rose-200'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
              title="Automatically play next episode when current finishes"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                Auto-Next: {autoPlayNext ? 'On' : 'Off'}
              </span>
              <span className="sm:hidden">{autoPlayNext ? 'Auto On' : 'Auto Off'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close binge playlist"
              className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Split Body: Sequential Player (Left) + Episode Queue (Right) */}
        {episodes.length === 0 || !currentEpisode ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-300">
              No episodes are linked to <strong className="text-white">{series.title}</strong> yet.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
            >
              Back to Series
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
            {/* Left Column: Active Episode Cinema Player & Sequential Controls */}
            <div className="lg:col-span-8 flex flex-col bg-black border-b lg:border-b-0 lg:border-r border-white/10 lg:overflow-y-auto">
              {/* 16:9 Clean Embedded Cinema Viewport */}
              <div className="relative aspect-video w-full bg-black overflow-hidden shrink-0">
                <iframe
                  ref={iframeRef}
                  key={currentEpisode.id}
                  src={embedUrl}
                  title={currentEpisode.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />

                {/* Protective corner masks to block external YouTube logo / watch-later outbound clicks */}
                <div
                  className="pointer-events-auto absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-black/75 to-transparent"
                  onClick={(e) => e.stopPropagation()}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-auto absolute bottom-0 right-11 w-28 h-11 bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                  aria-hidden="true"
                />

                {/* Top-Left Brand + Episode Marker */}
                <div className="pointer-events-none absolute top-3 left-3.5 flex items-center gap-2 text-xs">
                  <span className="brand-luxury-red font-black uppercase tracking-wide text-[11px]">
                    TK STORYWORLD
                  </span>
                  <span aria-hidden="true" className="text-white/40">·</span>
                  <span className="font-mono tabular-nums text-white/95 font-semibold drop-shadow">
                    S{String(currentEpisode.seasonNumber || 1).padStart(2, '0')} · E
                    {String(currentEpisode.episodeNumber || 1).padStart(2, '0')} of{' '}
                    {episodes.length}
                  </span>
                </div>

                {/* Up-Next Auto-Advance Overlay */}
                {upNextCountdown !== null && nextEpisode && (
                  <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="max-w-md w-full rounded-2xl bg-[#0D1018] border border-white/15 p-6 text-center space-y-4 shadow-2xl">
                      <div className="text-xs font-mono tabular-nums text-[#F59E0B] font-semibold">
                        Up Next in {upNextCountdown}s
                      </div>
                      <h3 className="font-display text-lg font-bold text-white leading-snug">
                        {nextEpisode.title}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {nextEpisode.synopsis}
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => goToEpisode(currentIndex + 1)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUpNextCountdown(null)}
                          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium cursor-pointer"
                        >
                          Stay Here
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Episode Details & Sequential Playback Controls */}
              <div className="p-4 sm:p-6 bg-[#090B10] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                      <span className="text-[#F59E0B] font-semibold">
                        Season {currentEpisode.seasonNumber || 1} · Episode{' '}
                        {currentEpisode.episodeNumber || currentIndex + 1}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span>
                        {currentIndex + 1} of {episodes.length}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {currentEpisode.durationFormatted}
                      </span>
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-snug">
                      {currentEpisode.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {currentEpisode.synopsis}
                    </p>
                  </div>
                </div>

                {/* Sequential Action Bar */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!prevEpisode}
                      onClick={() => prevEpisode && goToEpisode(currentIndex - 1)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed border border-white/10 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                      <span>Prev Episode</span>
                    </button>

                    <button
                      type="button"
                      disabled={!nextEpisode}
                      onClick={() => nextEpisode && goToEpisode(currentIndex + 1)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-35 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow"
                    >
                      <span>
                        {nextEpisode
                          ? `Next: S${String(nextEpisode.seasonNumber || 1).padStart(2, '0')}·E${String(nextEpisode.episodeNumber || currentIndex + 2).padStart(2, '0')}`
                          : 'Series Finale'}
                      </span>
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>

                    {currentIndex === episodes.length - 1 && episodes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => goToEpisode(0)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restart Series</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleWatchlist(currentEpisode.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {inWatchlist ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>Watchlist</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenInFullTheatre(currentEpisode);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      title="Open in Fullscreen Cinema Theatre"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                      <span>Full Theatre</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Sequential Episode Playlist Queue */}
            <aside className="lg:col-span-4 flex flex-col bg-[#0B0E15] min-h-0 lg:overflow-hidden">
              <div className="px-4 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <FastForward className="w-3.5 h-3.5 text-[#E11D48]" />
                  <span>Episode Queue</span>
                  <span className="font-mono tabular-nums text-slate-400 font-normal">
                    ({currentIndex + 1}/{episodes.length})
                  </span>
                </div>

                {seasons.length > 1 && (
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#05060A] border border-white/10">
                    <button
                      type="button"
                      onClick={() => setSeasonFilter('all')}
                      className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        seasonFilter === 'all'
                          ? 'bg-[#E11D48] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All
                    </button>
                    {seasons.map((sNum) => (
                      <button
                        key={sNum}
                        type="button"
                        onClick={() => setSeasonFilter(sNum)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          seasonFilter === sNum
                            ? 'bg-[#E11D48] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        S{sNum}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredQueue.map(({ ep, idx }) => {
                  const isActive = idx === currentIndex;
                  const prog = progressMap.get(ep.id);
                  const pct =
                    prog && prog.durationSeconds > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (prog.progressSeconds / prog.durationSeconds) * 100
                          )
                        )
                      : 0;
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => goToEpisode(idx)}
                      className={`group w-full p-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#170C14] border-[#E11D48]'
                          : 'bg-[#0E1118] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                        <CinemaPosterImage
                          src={ep.thumbnailUrl}
                          fallbackVideoId={ep.youtubeVideoId}
                          alt={ep.title}
                          category={ep.primaryCategory}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center ${
                              isActive
                                ? 'bg-[#E11D48] text-white'
                                : 'bg-black/75 text-white group-hover:bg-[#E11D48]'
                            }`}
                          >
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[9px] font-mono tabular-nums text-white">
                          {ep.durationFormatted}
                        </span>
                        {pct > 0 && (
                          <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/20">
                            <div
                              className="h-full bg-[#E11D48]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums">
                          <span
                            className={
                              isActive
                                ? 'text-[#E11D48] font-bold'
                                : 'text-[#F59E0B] font-semibold'
                            }
                          >
                            S{String(ep.seasonNumber || 1).padStart(2, '0')} · E
                            {String(ep.episodeNumber || idx + 1).padStart(2, '0')}
                          </span>
                          {isActive ? (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span className="text-emerald-400 font-sans font-semibold">
                                Now Playing
                              </span>
                            </>
                          ) : pct >= 92 ? (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span className="text-emerald-400 font-sans">
                                Watched
                              </span>
                            </>
                          ) : pct > 0 ? (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span className="text-slate-400">{pct}%</span>
                            </>
                          ) : null}
                        </div>
                        <div className="font-display text-xs font-semibold text-white line-clamp-2 leading-snug">
                          {ep.title}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

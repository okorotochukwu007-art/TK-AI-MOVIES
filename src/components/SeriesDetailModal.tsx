import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  Clock,
  Film,
  Play,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import {
  MovieItem,
  MovieSeries,
  WatchProgressItem,
} from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

interface SeriesDetailModalProps {
  series: MovieSeries;
  episodes: MovieItem[];
  progressMap: Map<string, WatchProgressItem>;
  watchlistIds: Set<string>;
  onClose: () => void;
  onPlayEpisode: (episode: MovieItem) => void;
  onToggleWatchlist: (movieId: string) => void;
}

function formatViewsCompact(views?: number): string {
  if (!views || views <= 0) return '120K views';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

export const SeriesDetailModal: React.FC<SeriesDetailModalProps> = ({
  series,
  episodes,
  progressMap,
  watchlistIds,
  onClose,
  onPlayEpisode,
  onToggleWatchlist,
}) => {
  const sortedEpisodes = useMemo(
    () =>
      [...episodes].sort(
        (a, b) =>
          (a.seasonNumber || 1) - (b.seasonNumber || 1) ||
          (a.episodeNumber || 1) - (b.episodeNumber || 1)
      ),
    [episodes]
  );

  const seasons = useMemo(() => {
    const nums = Array.from(
      new Set(sortedEpisodes.map((ep) => ep.seasonNumber || 1))
    ).sort((a, b) => a - b);
    return nums.length > 0 ? nums : [1];
  }, [sortedEpisodes]);

  const [selectedSeason, setSelectedSeason] = useState<number>(seasons[0]);

  useEffect(() => {
    if (!seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  // Lock background scroll & close on Escape
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const visibleEpisodes = useMemo(
    () =>
      sortedEpisodes.filter((ep) => (ep.seasonNumber || 1) === selectedSeason),
    [sortedEpisodes, selectedSeason]
  );

  // Determine best episode to launch/resume
  const resumeEpisode = useMemo(() => {
    let latestWatched: { ep: MovieItem; ts: number; pct: number } | null = null;
    for (const ep of sortedEpisodes) {
      const prog = progressMap.get(ep.id);
      if (prog && prog.progressSeconds > 15) {
        const ts = new Date(prog.lastWatchedAt).getTime() || 0;
        const pct =
          prog.durationSeconds > 0
            ? Math.round((prog.progressSeconds / prog.durationSeconds) * 100)
            : 0;
        if (!latestWatched || ts > latestWatched.ts) {
          latestWatched = { ep, ts, pct };
        }
      }
    }
    if (latestWatched) {
      if (latestWatched.pct >= 92) {
        const idx = sortedEpisodes.findIndex((e) => e.id === latestWatched!.ep.id);
        if (idx >= 0 && sortedEpisodes[idx + 1]) {
          return { episode: sortedEpisodes[idx + 1], isResume: false, isNext: true };
        }
      }
      return { episode: latestWatched.ep, isResume: true, isNext: false };
    }
    return sortedEpisodes[0]
      ? { episode: sortedEpisodes[0], isResume: false, isNext: false }
      : null;
  }, [sortedEpisodes, progressMap]);

  const firstEp = sortedEpisodes[0];
  const inList = firstEp ? watchlistIds.has(firstEp.id) : false;

  const totalViews =
    series.totalViews ||
    sortedEpisodes.reduce((acc, ep) => acc + (ep.viewCount || 0), 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`${series.title} Episodes`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl bg-[#090B10] border border-white/15 overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Hero Backdrop Header */}
        <div className="relative h-56 sm:h-72 w-full bg-black shrink-0 overflow-hidden">
          <CinemaPosterImage
            src={series.backdropUrl || series.thumbnailUrl}
            fallbackVideoId={firstEp?.youtubeVideoId}
            alt={series.title}
            category={series.primaryCategory}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090B10] via-[#090B10]/65 to-black/30" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close series details"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/75 hover:bg-black text-white border border-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Series Title & Unboxed Clean Metadata */}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="text-[#F59E0B] font-semibold">
                {series.releaseYear || '2026'} Series
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>{series.genreTag || series.primaryCategory}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-200">
                {sortedEpisodes.length}{' '}
                {sortedEpisodes.length === 1 ? 'Full Part' : 'Episodes'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#F59E0B]">
                <Star className="w-3 h-3 fill-current" />
                {(series.rating || 4.8).toFixed(1)}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-rose-300">
                {formatViewsCompact(totalViews)}
              </span>
            </div>

            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
              {series.title}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 max-w-2xl leading-relaxed">
              {series.synopsis}
            </p>
          </div>
        </div>

        {/* Action Strip & Season Filter */}
        <div className="px-5 sm:px-7 py-4 border-b border-white/10 bg-[#0B0E16] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {resumeEpisode && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPlayEpisode(resumeEpisode.episode);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-semibold shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {resumeEpisode.isResume ? (
                  <RotateCcw className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>
                  {resumeEpisode.isResume
                    ? `Resume S${String(resumeEpisode.episode.seasonNumber || 1).padStart(2, '0')} · E${String(resumeEpisode.episode.episodeNumber || 1).padStart(2, '0')}`
                    : resumeEpisode.isNext
                    ? `Play Next · S${String(resumeEpisode.episode.seasonNumber || 1).padStart(2, '0')} E${String(resumeEpisode.episode.episodeNumber || 1).padStart(2, '0')}`
                    : sortedEpisodes.length === 1
                    ? 'Watch Complete Series'
                    : `Watch S${String(resumeEpisode.episode.seasonNumber || 1).padStart(2, '0')} · E${String(resumeEpisode.episode.episodeNumber || 1).padStart(2, '0')}`}
                </span>
              </button>
            )}

            {firstEp && (
              <button
                type="button"
                onClick={() => onToggleWatchlist(firstEp.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs sm:text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {inList ? (
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
            )}
          </div>

          {/* Season Switcher (Interactive Filter Control when multi-season) */}
          {seasons.length > 1 && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#05060A] border border-white/10">
              {seasons.map((seasonNum) => (
                <button
                  key={seasonNum}
                  type="button"
                  onClick={() => setSelectedSeason(seasonNum)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

        {/* Scrollable Episode List */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
            <span className="font-semibold text-white flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>
                {seasons.length > 1
                  ? `Season ${selectedSeason} Episodes`
                  : sortedEpisodes.length === 1
                  ? 'Full Season Stream'
                  : 'All Episodes'}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              {visibleEpisodes.length}{' '}
              {visibleEpisodes.length === 1 ? 'part' : 'episodes'} · Auto-next enabled
            </span>
          </div>

          <div className="divide-y divide-white/10">
            {visibleEpisodes.map((ep) => {
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
                  onClick={() => {
                    onClose();
                    onPlayEpisode(ep);
                  }}
                  className="group w-full py-3.5 flex items-start sm:items-center gap-3.5 sm:gap-4 text-left hover:bg-white/[0.03] -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                >
                  {/* Episode Thumbnail */}
                  <div className="relative w-32 sm:w-44 aspect-video rounded-lg overflow-hidden bg-black shrink-0 border border-white/10 group-hover:border-[#E11D48]/70 transition-colors">
                    <CinemaPosterImage
                      src={ep.thumbnailUrl}
                      fallbackVideoId={ep.youtubeVideoId}
                      alt={ep.title}
                      category={ep.primaryCategory}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/45 flex items-center justify-center transition-colors">
                      <div className="w-9 h-9 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono tabular-nums text-white">
                      {ep.durationFormatted}
                    </span>
                    {pct > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                        <div
                          className="h-full bg-[#E11D48]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Episode Copy */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                      <span className="text-[#F59E0B] font-semibold">
                        S{String(ep.seasonNumber || 1).padStart(2, '0')} · E
                        {String(ep.episodeNumber || 1).padStart(2, '0')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {ep.durationFormatted}
                      </span>
                      {pct > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400">
                            {pct >= 92 ? 'Watched' : `${pct}% watched`}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="font-display text-sm sm:text-base font-semibold text-white group-hover:text-[#F59E0B] transition-colors line-clamp-1">
                      {ep.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {ep.synopsis}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

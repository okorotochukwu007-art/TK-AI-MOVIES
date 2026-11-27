import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Film,
  Flame,
  Globe2,
  Play,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  MovieItem,
  TmdbPremiereItem,
  TmdbPremieresResponse,
} from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

interface JustDropped2026HubProps {
  allMovies: MovieItem[];
  excludeMovieKeys?: Set<string>;
  onPlayMovie: (movie: MovieItem) => void;
}

type RegionTab = 'all' | 'full_movies' | 'global' | 'nollywood';

function normalizeMatchTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(2026|full|movie|official|trailer|hd|4k|nollywood|latest|new|teaser)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatReleaseDate(dateStr?: string): string {
  if (!dateStr) return '2026';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr.slice(0, 10);
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function premiereToPlayableMovie(item: TmdbPremiereItem): MovieItem {
  const isFull = item.releaseKind === 'full_movie';
  const platform = item.sourcePlatform || 'youtube';
  const videoId = item.videoId || '';
  const youtubeVideoId =
    platform === 'dailymotion'
      ? `dm:${videoId}`
      : platform === 'vimeo'
      ? `vm:${videoId}`
      : platform === 'archive'
      ? `ia:${videoId}`
      : videoId;
  const nowIso = new Date().toISOString();

  return {
    id: `premiere-${item.id}`,
    title: isFull ? item.title : `${item.title} — Official 2026 Trailer`,
    youtubeVideoId,
    sourcePlatform: platform,
    externalVideoId: videoId,
    releaseKind: isFull ? 'full_movie' : 'official_trailer',
    tmdbId: item.tmdbId,
    releaseDate: item.releaseDate,
    voteAverage: item.rating,
    watchProviders: item.watchProviders,
    synopsis:
      item.overview ||
      'Newly released 2026 cinema premiere featured in the TK STORYWORLD Just Dropped in 2026 Hub.',
    channelTitle:
      item.channelTitle ||
      (item.region === 'nollywood'
        ? 'Nollywood 2026 Premiere'
        : 'Global 2026 Cinema Premiere'),
    channelId: `tmdb-2026-${item.region}`,
    publishedAt: item.releaseDate
      ? `${item.releaseDate}T00:00:00.000Z`
      : nowIso,
    durationSeconds: item.durationSeconds || (isFull ? 4800 : 155),
    durationFormatted: item.durationFormatted || (isFull ? '1:20:00' : '2:35'),
    thumbnailUrl: item.backdropUrl || item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    primaryCategory: 'New Movies',
    secondaryCategories: ['Newly Released Movies'],
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    viewCount: Math.max(250000, Math.round((item.rating || 7.5) * 140000)),
    likeCount: Math.max(8500, Math.round((item.rating || 7.5) * 3200)),
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    hookTag: isFull
      ? 'FULL MOVIE · 2026'
      : item.region === 'nollywood'
      ? 'NOLLYWOOD 2026 · TRAILER'
      : '2026 PREMIERE · TRAILER',
    discoveredVia: 'tmdb_2026',
    aiQualityScore: 95,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export const JustDropped2026Hub: React.FC<JustDropped2026HubProps> = ({
  allMovies,
  excludeMovieKeys,
  onPlayMovie,
}) => {
  const [regionTab, setRegionTab] = useState<RegionTab>('all');
  const [items, setItems] = useState<TmdbPremiereItem[]>([]);
  const [sourceMode, setSourceMode] = useState<
    'tmdb_live' | 'live_cinema_fallback'
  >('live_cinema_fallback');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadPremieres = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    try {
      const res = await fetch('/api/movies/tmdb-2026?region=all');
      if (!res.ok) {
        throw new Error(`Feed returned ${res.status}`);
      }
      const data = (await res.json()) as TmdbPremieresResponse;
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items);
        setSourceMode(data.mode || 'live_cinema_fallback');
        setUpdatedAt(data.updatedAt || new Date().toISOString());
      } else {
        setItems([]);
      }
    } catch {
      setErrorMsg('Could not reach live 2026 premiere feed right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPremieres(false);
  }, [loadPremieres]);

  // Build normalized lookup index of full movies already playable in TK STORYWORLD
  const catalogMatchMap = useMemo(() => {
    const map = new Map<string, MovieItem>();
    for (const mov of allMovies) {
      const norm = normalizeMatchTitle(mov.title);
      if (norm.length >= 4 && !map.has(norm)) {
        map.set(norm, mov);
      }
    }
    return map;
  }, [allMovies]);

  const findCatalogFullMovie = useCallback(
    (title: string): MovieItem | null => {
      const norm = normalizeMatchTitle(title);
      if (norm.length < 4) return null;
      const exact = catalogMatchMap.get(norm);
      if (exact) return exact;

      // Partial match when a premiere title is clearly contained inside a catalog title
      for (const [key, mov] of catalogMatchMap.entries()) {
        if (
          (norm.length >= 6 && key.includes(norm)) ||
          (key.length >= 6 && norm.includes(key))
        ) {
          return mov;
        }
      }
      return null;
    },
    [catalogMatchMap]
  );

  // Filter out any movie already shown elsewhere on the Home page + deduplicate within the hub itself
  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const normTitle = normalizeMatchTitle(item.title);
      const vid = (item.videoId || '').trim().toLowerCase();
      if (excludeMovieKeys) {
        if (normTitle && excludeMovieKeys.has(normTitle)) return false;
        if (vid && excludeMovieKeys.has(`vid:${vid}`)) return false;
      }
      const key = normTitle || item.id;
      if (seen.has(key) || (vid && seen.has(`vid:${vid}`))) return false;
      seen.add(key);
      if (vid) seen.add(`vid:${vid}`);
      return true;
    });
  }, [items, excludeMovieKeys]);

  const globalItems = useMemo(
    () => uniqueItems.filter((item) => item.region === 'global'),
    [uniqueItems]
  );
  const nollywoodItems = useMemo(
    () => uniqueItems.filter((item) => item.region === 'nollywood'),
    [uniqueItems]
  );

  const fullMovieItems = useMemo(
    () =>
      uniqueItems.filter(
        (item) =>
          Boolean(findCatalogFullMovie(item.title)) ||
          (item.releaseKind === 'full_movie' && Boolean(item.videoId))
      ),
    [uniqueItems, findCatalogFullMovie]
  );

  const visibleItems = useMemo(() => {
    if (regionTab === 'full_movies') return fullMovieItems;
    if (regionTab === 'global') return globalItems;
    if (regionTab === 'nollywood') return nollywoodItems;
    return uniqueItems;
  }, [uniqueItems, fullMovieItems, globalItems, nollywoodItems, regionTab]);

  if (!loading && uniqueItems.length === 0 && !errorMsg) {
    return null;
  }

  return (
    <section
      id="just-dropped-2026"
      className="rounded-2xl bg-gradient-to-br from-[#0F0B18] via-[#0B0D14] to-[#140A0F] border border-amber-500/25 p-4 sm:p-6 space-y-5 shadow-2xl"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-gradient-to-r from-[#F59E0B] to-[#E11D48] text-white uppercase tracking-wider shadow">
              <Sparkles className="w-3 h-3" />
              <span>Just Dropped in 2026 Hub</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {sourceMode === 'tmdb_live'
                ? 'Live 2026 Premiere Feed'
                : 'Live 2026 Premieres · Global + Nollywood'}
            </span>
            {updatedAt && (
              <span className="hidden sm:inline text-[10px] font-mono text-slate-400">
                Synced {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Newest 2026 Global &amp; Nollywood Releases
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Daily feed of brand-new 2026 movies with HD artwork, ratings, official trailers, and instant full-movie matches right inside TK STORYWORLD. Every card clearly shows{' '}
            <span className="text-emerald-400 font-semibold">FULL MOVIE</span> vs{' '}
            <span className="text-amber-300 font-semibold">2026 PREMIERE · TRAILER</span>.
          </p>
        </div>

        {/* Filter Tabs + Refresh */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center p-1 rounded-xl bg-black/50 border border-white/10 overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'all', label: `All 2026 (${uniqueItems.length})` },
                { id: 'full_movies', label: `Full Movies (${fullMovieItems.length})` },
                { id: 'global', label: `Global (${globalItems.length})` },
                { id: 'nollywood', label: `Nollywood (${nollywoodItems.length})` },
              ] as const
            )
              .filter((t) => t.id !== 'full_movies' || fullMovieItems.length > 0)
              .map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRegionTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    regionTab === tab.id
                      ? tab.id === 'full_movies'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-[#E11D48] text-white shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </div>

          <button
            type="button"
            onClick={() => void loadPremieres(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh 2026 Releases"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F59E0B] ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex overflow-x-auto no-scrollbar gap-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="w-[78vw] max-w-[290px] sm:w-auto sm:max-w-none shrink-0 rounded-xl bg-[#0D1018] border border-white/10 overflow-hidden animate-pulse"
            >
              <div className="aspect-video w-full bg-white/5" />
              <div className="p-3.5 space-y-2">
                <div className="h-4 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-8 w-full rounded-lg bg-white/10 mt-2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && errorMsg && items.length === 0 && (
        <div className="rounded-xl bg-black/40 border border-white/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-300">{errorMsg}</div>
          <button
            type="button"
            onClick={() => void loadPremieres(true)}
            className="px-4 py-2 rounded-lg bg-[#E11D48] text-white text-xs font-bold cursor-pointer self-start sm:self-auto"
          >
            Retry 2026 Feed
          </button>
        </div>
      )}

      {/* Cards Rail (Edge-to-Edge Snap on Mobile, 4-Column Grid on Desktop) */}
      {!loading && visibleItems.length > 0 && (
        <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {visibleItems.slice(0, 12).map((item) => {
            const matchedCatalogMovie = findCatalogFullMovie(item.title);
            const isFullPlayable =
              Boolean(matchedCatalogMovie) ||
              (item.releaseKind === 'full_movie' && Boolean(item.videoId));
            const hasPlayableVideo =
              Boolean(matchedCatalogMovie) || Boolean(item.videoId);

            const handlePrimaryPlay = () => {
              if (matchedCatalogMovie) {
                onPlayMovie(matchedCatalogMovie);
                return;
              }
              if (item.videoId) {
                onPlayMovie(premiereToPlayableMovie(item));
              }
            };

            return (
              <div
                key={item.id}
                className="group relative w-[78vw] max-w-[295px] sm:w-auto sm:max-w-none shrink-0 snap-start rounded-xl bg-[#0D1018] border border-white/10 hover:border-amber-400/50 overflow-hidden flex flex-col transition-all hover:-translate-y-0.5"
              >
                {/* Artwork Stage */}
                <div
                  onClick={hasPlayableVideo ? handlePrimaryPlay : undefined}
                  className={`relative aspect-video w-full bg-black overflow-hidden ${
                    hasPlayableVideo ? 'cursor-pointer' : ''
                  }`}
                >
                  <CinemaPosterImage
                    src={item.backdropUrl || item.posterUrl}
                    fallbackVideoId={
                      item.sourcePlatform === 'youtube' ? item.videoId || undefined : undefined
                    }
                    alt={item.title}
                    category={item.region === 'nollywood' ? 'Billionaire Romance' : 'New Movies'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D1018] via-black/20 to-black/45" />

                  {/* Top-Left Trust Label: FULL MOVIE vs 2026 PREMIERE · TRAILER */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1.5">
                    {isFullPlayable ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[9.5px] font-extrabold uppercase tracking-wider shadow">
                        <Film className="w-2.5 h-2.5" />
                        <span>
                          {matchedCatalogMovie
                            ? 'FULL MOVIE · IN APP'
                            : 'FULL MOVIE · HD'}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-black text-[9.5px] font-extrabold uppercase tracking-wider shadow">
                        <Flame className="w-2.5 h-2.5" />
                        <span>2026 PREMIERE · TRAILER</span>
                      </span>
                    )}

                    {item.rating > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/80 border border-white/15 text-[#F59E0B] font-mono text-[10px] font-bold shrink-0">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span>{item.rating.toFixed(1)}</span>
                      </span>
                    )}
                  </div>

                  {/* Center Play Button */}
                  {hasPlayableVideo && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-black/20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrimaryPlay();
                        }}
                        className={`w-11 h-11 rounded-full text-white flex items-center justify-center shadow-xl transition-transform hover:scale-110 cursor-pointer ${
                          isFullPlayable ? 'bg-emerald-600' : 'bg-[#E11D48]'
                        }`}
                        aria-label={`Play ${item.title}`}
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                    </div>
                  )}

                  {/* Bottom Region + Release Date */}
                  <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] text-slate-200 font-medium">
                    <span className="inline-flex items-center gap-1 text-slate-100">
                      <Globe2 className="w-3 h-3 text-[#F59E0B]" />
                      <span>
                        {item.region === 'nollywood' ? 'Nollywood' : 'Global 2026'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-slate-300">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{formatReleaseDate(item.releaseDate)}</span>
                    </span>
                  </div>
                </div>

                {/* Card Details */}
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="font-display text-sm font-bold text-white group-hover:text-[#F59E0B] transition-colors line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {item.overview}
                    </p>
                  </div>

                  {/* Action Row */}
                  <div className="space-y-2 pt-1">
                    {hasPlayableVideo ? (
                      <button
                        type="button"
                        onClick={handlePrimaryPlay}
                        className={`w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          isFullPlayable
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                            : 'bg-[#E11D48] hover:bg-[#BE123C] text-white shadow'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {isFullPlayable
                            ? 'Watch Full Movie Now'
                            : 'Watch Official 2026 Trailer'}
                        </span>
                      </button>
                    ) : (
                      <div className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold">
                        <Film className="w-3.5 h-3.5 text-[#F59E0B]" />
                        <span>Coming Soon to TK STORYWORLD</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

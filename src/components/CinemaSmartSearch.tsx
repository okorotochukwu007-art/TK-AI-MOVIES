import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Download,
  Film,
  Globe,
  Loader2,
  Play,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { MovieItem } from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

interface SmartMovieSuggestion {
  title: string;
  year: string;
  genre: string;
  synopsis: string;
  whySimilar: string;
  youtubeQuery: string;
  posterUrl?: string;
}

interface RecognizedPopularMovie {
  canonicalTitle: string;
  releaseYear: string;
  primaryGenre: string;
  allGenres: string[];
  directorOrStudio: string;
  castHighlights: string;
  synopsis: string;
  posterUrl?: string;
  runtimeLabel?: string;
  isPopularMovie: boolean;
  detectedIntent:
    | 'popular_movie'
    | 'genre_or_mood'
    | 'actor_or_director'
    | 'franchise'
    | 'non_movie';
}

interface OutsideAppMovieResult extends MovieItem {
  releaseKind: 'full_movie' | 'official_trailer';
  externalGenreLabel: string;
  releaseYear: string;
  sourcePlatformLabel: string;
}

interface SmartMovieSearchResponse {
  query: string;
  isMovieQuery: boolean;
  rejectionReason: string | null;
  recognizedMovie: RecognizedPopularMovie | null;
  outsideMovies: OutsideAppMovieResult[];
  relatedSuggestions: SmartMovieSuggestion[];
  intelligenceNotice?: string | null;
}

interface CinemaSmartSearchProps {
  query: string;
  onQueryChange: (next: string) => void;
  inAppMatches: MovieItem[];
  allAppMoviesCount: number;
  watchlistIds: Set<string>;
  onPlayMovie: (movie: MovieItem) => void;
  onDownloadMovie: (movie: MovieItem) => void;
  onToggleWatchlist: (movieId: string) => void;
  variant: 'home' | 'categories';
  categoryLabel?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  renderInAppCard: (movie: MovieItem) => React.ReactNode;
}

const EXPLORE_MOVIE_SHORTCUTS = [
  'John Wick',
  'Anikulapo',
  'Inception',
  'Horror Movies',
  'Sci-Fi Thriller',
  'Korean Action',
  'Comedy Movies',
  'Anime Movies',
];

const NON_MOVIE_LOCAL_REGEX =
  /\b(recipe|how to cook|cook rice|bake cake|bitcoin|crypto price|forex|weather|python tutorial|javascript tutorial|football highlights|premier league table|song lyrics|mp3 download|stock price)\b/i;

function inferGenreBrowser(text: string): { primary: string; all: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  if (/\b(sci-fi|science fiction|cyberpunk|space|dystopian)\b/.test(lower)) matched.push('Sci-Fi');
  if (/\b(action|martial arts|heist|spy|assassin|superhero)\b/.test(lower)) matched.push('Action');
  if (/\b(horror|slasher|supernatural|haunted|zombie)\b/.test(lower)) matched.push('Horror');
  if (/\b(thriller|mystery|suspense|crime|noir)\b/.test(lower)) matched.push('Thriller');
  if (/\b(comedy|rom-com|satire|parody)\b/.test(lower)) matched.push('Comedy');
  if (/\b(romance|romantic|love story)\b/.test(lower)) matched.push('Romance');
  if (/\b(anime|animated|animation)\b/.test(lower)) matched.push('Animation');
  if (/\b(fantasy|epic|mytholog)\b/.test(lower)) matched.push('Fantasy');
  if (/\b(nigerian|nollywood|yoruba|african)\b/.test(lower)) matched.push('Nollywood');
  if (/\b(korean|k-drama|bollywood|indian|japanese)\b/.test(lower)) matched.push('World Cinema');
  if (/\b(drama|biographical|historical)\b/.test(lower)) matched.push('Drama');
  if (matched.length === 0) return { primary: 'Feature Film', all: ['Feature Film', 'Global Cinema'] };
  return { primary: matched[0], all: matched.slice(0, 4) };
}

async function fetchJsonAbortable(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export const CinemaSmartSearch: React.FC<CinemaSmartSearchProps> = ({
  query,
  onQueryChange,
  inAppMatches,
  allAppMoviesCount,
  watchlistIds,
  onPlayMovie,
  onDownloadMovie,
  onToggleWatchlist,
  variant,
  categoryLabel,
  inputRef,
  renderInAppCard,
}) => {
  void allAppMoviesCount;
  void categoryLabel;
  const [isSearchingOutside, setIsSearchingOutside] = useState(false);
  const [outsideResult, setOutsideResult] =
    useState<SmartMovieSearchResponse | null>(null);
  const [outsideError, setOutsideError] = useState<string | null>(null);

  const activeRequestIdRef = useRef(0);
  const lastFetchedQueryRef = useRef('');
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);

  const setCombinedInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      localInputRef.current = node;
      if (inputRef) {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    },
    [inputRef]
  );

  const runBrowserCinemaFallback = useCallback(
    async (clean: string, reqId: number) => {
      if (NON_MOVIE_LOCAL_REGEX.test(clean)) {
        if (reqId !== activeRequestIdRef.current) return;
        setOutsideResult({
          query: clean,
          isMovieQuery: false,
          rejectionReason:
            'Strict Movie Search Only — TK STORYWORLD discovers strictly movies across all genres worldwide.',
          recognizedMovie: null,
          outsideMovies: [],
          relatedSuggestions: [],
        });
        return;
      }

      const hasMovieWord = /\b(film|movie|cinema|anime)\b/i.test(clean);
      const wikiTerm = hasMovieWord ? clean : `${clean} film`;
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        wikiTerm
      )}&gsrlimit=10&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;

      const [wikiRes, itunesRes] = await Promise.allSettled([
        fetchJsonAbortable(wikiUrl, {}, 6000),
        fetchJsonAbortable(
          `https://itunes.apple.com/search?term=${encodeURIComponent(
            clean
          )}&media=movie&entity=movie&limit=8&country=US`,
          {},
          4000
        ),
      ]);

      if (reqId !== activeRequestIdRef.current) return;

      let wikiPages: Array<{
        title: string;
        index?: number;
        extract?: string;
        thumbnail?: { source?: string };
      }> = [];

      if (wikiRes.status === 'fulfilled' && wikiRes.value.ok) {
        try {
          const wJson = await wikiRes.value.json();
          const pagesObj = wJson?.query?.pages;
          if (pagesObj && typeof pagesObj === 'object') {
            wikiPages = (Object.values(pagesObj) as any[])
              .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
              .filter((p) => {
                const tl = String(p.title || '').toLowerCase();
                const el = String(p.extract || '').toLowerCase();
                if (tl.includes('(soundtrack)') || tl.includes('(disambiguation)')) {
                  return false;
                }
                return /\b(film|movie|cinema|animated|thriller|drama|comedy|horror|sci-fi|nollywood|bollywood|anime|directed by|starring|release|box office)\b/.test(
                  `${tl} ${el}`
                );
              });
          }
        } catch {
          // ignore parse error
        }
      }

      let itunesRows: any[] = [];
      if (itunesRes.status === 'fulfilled' && itunesRes.value.ok) {
        try {
          const iJson = await itunesRes.value.json();
          if (Array.isArray(iJson?.results)) {
            itunesRows = iJson.results;
          }
        } catch {
          // ignore parse error
        }
      }

      const topWiki = wikiPages[0];
      const topItunes = itunesRows[0];

      if (!topWiki && !topItunes) {
        const fallbackGenres = inferGenreBrowser(clean);
        setOutsideResult({
          query: clean,
          isMovieQuery: true,
          rejectionReason: null,
          recognizedMovie: {
            canonicalTitle: clean,
            releaseYear: '',
            primaryGenre: fallbackGenres.primary,
            allGenres: fallbackGenres.all,
            directorOrStudio: '',
            castHighlights: '',
            synopsis: `Showing matching ${fallbackGenres.primary.toLowerCase()} titles across TK STORYWORLD.`,
            isPopularMovie: false,
            detectedIntent: 'genre_or_mood',
          },
          outsideMovies: [],
          relatedSuggestions: [],
        });
        return;
      }

      const cleanTitle =
        topWiki?.title?.replace(/\s*\([^)]*film[^)]*\)/i, '').trim() ||
        topItunes?.trackName ||
        clean;
      const synopsis =
        topWiki?.extract ||
        topItunes?.longDescription ||
        topItunes?.shortDescription ||
        `Popular global movie matching "${clean}".`;
      const yearMatch = synopsis.match(/\b(19\d{2}|20[0-2]\d)\b/);
      const releaseYear =
        yearMatch?.[1] ||
        (topItunes?.releaseDate ? String(topItunes.releaseDate).slice(0, 4) : '');
      const genres = inferGenreBrowser(`${clean} ${synopsis} ${topItunes?.primaryGenreName || ''}`);
      const posterUrl =
        topWiki?.thumbnail?.source ||
        (topItunes?.artworkUrl100
          ? String(topItunes.artworkUrl100).replace('100x100bb', '600x600bb')
          : undefined);

      const relatedMap = new Map<string, SmartMovieSuggestion>();
      for (const p of wikiPages.slice(1, 8)) {
        const t = p.title.replace(/\s*\([^)]*film[^)]*\)/i, '').trim();
        const k = t.toLowerCase();
        if (!t || k === cleanTitle.toLowerCase() || relatedMap.has(k)) continue;
        const yr = p.extract?.match(/\b(19\d{2}|20[0-2]\d)\b/)?.[1] || '';
        const g = inferGenreBrowser(p.extract || '');
        relatedMap.set(k, {
          title: t,
          year: yr,
          genre: g.primary,
          synopsis: (p.extract || '').slice(0, 180),
          whySimilar: `Related ${g.primary} film matching "${clean}"`,
          youtubeQuery: `${t} ${yr} full movie`.trim(),
          posterUrl: p.thumbnail?.source,
        });
      }
      for (const r of itunesRows.slice(1, 7)) {
        const t = String(r.trackName || '').trim();
        const k = t.toLowerCase();
        if (!t || k === cleanTitle.toLowerCase() || relatedMap.has(k)) continue;
        relatedMap.set(k, {
          title: t,
          year: r.releaseDate ? String(r.releaseDate).slice(0, 4) : '',
          genre: r.primaryGenreName || 'Feature Film',
          synopsis: r.longDescription || r.shortDescription || '',
          whySimilar: `Popular global ${r.primaryGenreName || 'movie'} release`,
          youtubeQuery: `${t} full movie`,
          posterUrl: r.artworkUrl100
            ? String(r.artworkUrl100).replace('100x100bb', '600x600bb')
            : undefined,
        });
      }

      setOutsideResult({
        query: clean,
        isMovieQuery: true,
        rejectionReason: null,
        recognizedMovie: {
          canonicalTitle: cleanTitle,
          releaseYear,
          primaryGenre: genres.primary,
          allGenres: genres.all,
          directorOrStudio: topItunes?.artistName || '',
          castHighlights: '',
          synopsis,
          posterUrl,
          isPopularMovie: Boolean(wikiPages.length > 0 || topItunes),
          detectedIntent: 'popular_movie',
        },
        outsideMovies: [],
        relatedSuggestions: Array.from(relatedMap.values()).slice(0, 8),
      });
    },
    []
  );

  const runOutsideSearch = useCallback(
    async (searchTerm: string) => {
      const clean = searchTerm.trim();
      if (clean.length < 2) {
        setOutsideResult(null);
        setOutsideError(null);
        setIsSearchingOutside(false);
        return;
      }

      const reqId = ++activeRequestIdRef.current;
      lastFetchedQueryRef.current = clean;
      setIsSearchingOutside(true);
      setOutsideError(null);

      try {
        let res = await fetchJsonAbortable(
          '/api/movies/smart-search',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: clean }),
          },
          8500
        ).catch(() => null);

        if (reqId !== activeRequestIdRef.current) return;

        // Retry with GET if edge proxy / CDN rejects POST (405)
        if (res && res.status === 405) {
          res = await fetchJsonAbortable(
            `/api/movies/smart-search?q=${encodeURIComponent(clean)}`,
            { method: 'GET' },
            8500
          ).catch(() => null);
          if (reqId !== activeRequestIdRef.current) return;
        }

        const contentType = res?.headers.get('content-type') || '';
        if (res && res.ok && contentType.includes('application/json')) {
          const data = (await res.json()) as SmartMovieSearchResponse;
          if (reqId !== activeRequestIdRef.current) return;
          if (data && typeof data.isMovieQuery === 'boolean') {
            setOutsideResult(data);
            return;
          }
        }

        // Seamless Cloudflare Static / Edge Fallback
        await runBrowserCinemaFallback(clean, reqId);
      } catch {
        if (reqId !== activeRequestIdRef.current) return;
        try {
          await runBrowserCinemaFallback(clean, reqId);
        } catch (fallbackErr: any) {
          if (reqId !== activeRequestIdRef.current) return;
          setOutsideError(
            fallbackErr?.message ||
              'Network error while searching movies. Please check your connection.'
          );
        }
      } finally {
        if (reqId === activeRequestIdRef.current) {
          setIsSearchingOutside(false);
        }
      }
    },
    [runBrowserCinemaFallback]
  );

  // Debounced outside-the-app search when user types >= 2 chars
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      activeRequestIdRef.current++;
      lastFetchedQueryRef.current = '';
      setOutsideResult(null);
      setOutsideError(null);
      setIsSearchingOutside(false);
      return;
    }

    if (clean === lastFetchedQueryRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runOutsideSearch(clean);
    }, 520);

    return () => window.clearTimeout(timer);
  }, [query, runOutsideSearch]);

  const scrollToResultsMobile = useCallback(() => {
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 90);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    if (window.innerWidth < 768) {
      localInputRef.current?.blur();
    }
    void runOutsideSearch(clean);
    scrollToResultsMobile();
  };

  const handleQuickExplore = (term: string) => {
    onQueryChange(term);
    if (window.innerWidth < 768) {
      localInputRef.current?.blur();
    }
    void runOutsideSearch(term);
    scrollToResultsMobile();
  };

  const hasActiveQuery = query.trim().length > 0;
  const isMovieRejected = outsideResult?.isMovieQuery === false;
  const showInAppSection = hasActiveQuery && variant === 'home';
  const showOutsideSection = hasActiveQuery;

  return (
    <div className="w-full space-y-5">
      {/* VISIBLE CINEMA SEARCH BAR PANEL */}
      <div className="rounded-2xl bg-[#0B0E15] border border-white/15 p-3.5 sm:p-5 space-y-3.5 shadow-xl">
        <div className="flex items-center gap-3">
          <form
            onSubmit={handleSubmit}
            className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 bg-[#050505] border border-white/15 focus-within:border-[#E11D48] rounded-xl p-2 sm:px-3.5 sm:py-1.5 transition-colors"
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0 px-1.5 sm:px-0">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-[#F59E0B] shrink-0" />
              <input
                ref={setCombinedInputRef}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search any movie on App or Worldwide..."
                aria-label="Search movies inside and outside the app"
                className="flex-1 min-w-0 min-h-[44px] bg-transparent text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    onQueryChange('');
                    setOutsideResult(null);
                    setOutsideError(null);
                  }}
                  className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!query.trim() || isSearchingOutside}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5"
            >
              {isSearchingOutside ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Searching</span>
                </>
              ) : (
                <span>Search Movies</span>
              )}
            </button>
          </form>
        </div>

        {/* Strict Movie Scope Caption + 1-Tap Genre & Popular Movie Shortcuts */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-white/10">
          <div className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-2 flex-wrap">
            <Film className="w-3.5 h-3.5 text-[#E11D48] shrink-0" />
            <span>Strictly Movies Only</span>
            <span aria-hidden="true">·</span>
            <span>All Genres Worldwide</span>
            <span aria-hidden="true">·</span>
            <span>Smart Popular Movie Detection</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {EXPLORE_MOVIE_SHORTCUTS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => handleQuickExplore(term)}
                className="px-2.5 py-1.5 rounded-lg bg-[#050505] hover:bg-[#171C28] border border-white/10 hover:border-white/25 text-[11px] font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ACTIVE SEARCH RESULTS PANEL (Home In-App + Recognized Popular Movie + Outside the App Explorer) */}
      {hasActiveQuery && (
        <div ref={resultsSectionRef} className="space-y-8 scroll-mt-32">
          {/* STRICT MOVIE-ONLY REJECTION NOTICE */}
          {isMovieRejected && (
            <div className="rounded-2xl bg-[#12090D] border border-[#E11D48]/40 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#F59E0B]">
                  Strict Movie Filter Active
                </div>
                <h3 className="font-display text-base sm:text-lg font-bold text-white">
                  "{query.trim()}" does not look like a movie search
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
                  {outsideResult?.rejectionReason ||
                    'This search bar strictly discovers movies across all film genres worldwide (Action, Romance, Nollywood, Sci-Fi, Horror, Comedy, Anime, Documentaries). Try typing a movie title, actor, or genre.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onQueryChange('');
                  setOutsideResult(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          )}

          {/* IN-APP MATCHES ON HOME PAGE (Category page renders its own filtered grid below) */}
          {showInAppSection && !isMovieRejected && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-2 border-b border-white/10">
                <div>
                  <div className="text-xs text-[#F59E0B] font-medium">
                    On TK STORYWORLD · Instant Stream & .MP4 Download
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-0.5">
                    Movies on This App Matching "{query.trim()}" ({inAppMatches.length})
                  </h2>
                </div>
                {inAppMatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onQueryChange('')}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer self-start sm:self-auto"
                  >
                    Clear Search Results
                  </button>
                )}
              </div>

              {inAppMatches.length === 0 ? (
                <div className="rounded-xl bg-[#0B0E15] border border-white/10 p-5 text-xs sm:text-sm text-slate-300">
                  No exact match inside TK STORYWORLD's in-app library for "
                  {query.trim()}" — check the <strong className="text-white">Outside the App Movie Explorer</strong> below to watch or explore more movies globally.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {inAppMatches.slice(0, 12).map((m) => renderInAppCard(m))}
                </div>
              )}
            </section>
          )}

          {/* OUTSIDE THE APP GLOBAL MOVIE EXPLORER + POPULAR MOVIE INTELLIGENCE */}
          {showOutsideSection && !isMovieRejected && (
            <section className="rounded-2xl bg-[#090B10] border border-white/10 p-5 sm:p-7 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>Outside the App Explorer · Strictly Movies Worldwide</span>
                  </div>
                  <h2 className="font-display text-lg sm:text-2xl font-bold text-white mt-0.5">
                    Explore "{query.trim()}" Outside TK STORYWORLD
                  </h2>
                </div>

                {isSearchingOutside && (
                  <div className="inline-flex items-center gap-2 text-xs text-[#F59E0B] font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Identifying movie & scanning playable streams...</span>
                  </div>
                )}
              </div>

              {outsideError && (
                <div className="rounded-xl bg-rose-950/30 border border-rose-500/30 p-4 text-xs sm:text-sm text-rose-200 flex items-center justify-between gap-3">
                  <span>{outsideError}</span>
                  <button
                    type="button"
                    onClick={() => void runOutsideSearch(query)}
                    className="px-3 py-1.5 rounded-lg bg-[#E11D48] text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* SMART POPULAR MOVIE RECOGNITION SPOTLIGHT */}
              {outsideResult?.recognizedMovie && (
                <div className="rounded-2xl bg-[#0E1118] border border-white/15 p-4 sm:p-6 flex flex-col md:flex-row gap-5 items-start">
                  <div className="w-full md:w-52 aspect-video md:aspect-[3/4] rounded-xl overflow-hidden bg-black shrink-0 border border-white/10">
                    {outsideResult.recognizedMovie.posterUrl ? (
                      <img
                        src={outsideResult.recognizedMovie.posterUrl}
                        alt={outsideResult.recognizedMovie.canonicalTitle}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : outsideResult.outsideMovies[0] ? (
                      <CinemaPosterImage
                        src={
                          outsideResult.outsideMovies[0].backdropUrl ||
                          outsideResult.outsideMovies[0].thumbnailUrl
                        }
                        fallbackVideoId={
                          outsideResult.outsideMovies[0].youtubeVideoId
                        }
                        alt={outsideResult.recognizedMovie.canonicalTitle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#190A10] via-[#0B0E15] to-[#081214] flex flex-col items-center justify-center p-4 text-center">
                        <Film className="w-8 h-8 text-[#E11D48] mb-2" />
                        <span className="font-display text-xs font-bold text-white line-clamp-2">
                          {outsideResult.recognizedMovie.canonicalTitle}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1 text-[#F59E0B] font-semibold">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {outsideResult.recognizedMovie.isPopularMovie
                            ? 'Popular Movie Recognized'
                            : 'Global Movie Match'}
                        </span>
                      </span>
                      {outsideResult.recognizedMovie.releaseYear && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-200">
                            {outsideResult.recognizedMovie.releaseYear}
                          </span>
                        </>
                      )}
                      {outsideResult.recognizedMovie.allGenres.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {outsideResult.recognizedMovie.allGenres.join(' / ')}
                          </span>
                        </>
                      )}
                      {outsideResult.recognizedMovie.runtimeLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {outsideResult.recognizedMovie.runtimeLabel}
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white">
                      {outsideResult.recognizedMovie.canonicalTitle}
                    </h3>

                    {(outsideResult.recognizedMovie.directorOrStudio ||
                      outsideResult.recognizedMovie.castHighlights) && (
                      <div className="text-xs text-slate-300 space-y-0.5">
                        {outsideResult.recognizedMovie.directorOrStudio && (
                          <div>
                            <span className="text-slate-500">Director / Studio: </span>
                            <span>{outsideResult.recognizedMovie.directorOrStudio}</span>
                          </div>
                        )}
                        {outsideResult.recognizedMovie.castHighlights && (
                          <div>
                            <span className="text-slate-500">Starring: </span>
                            <span>{outsideResult.recognizedMovie.castHighlights}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {outsideResult.recognizedMovie.synopsis && (
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                        {outsideResult.recognizedMovie.synopsis}
                      </p>
                    )}

                    {outsideResult.outsideMovies[0] ? (
                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            onPlayMovie(outsideResult.outsideMovies[0])
                          }
                          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>
                            {outsideResult.outsideMovies[0].releaseKind ===
                            'full_movie'
                              ? 'Watch Discovered Movie In-App'
                              : 'Watch Official Preview In-App'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onDownloadMovie(outsideResult.outsideMovies[0])
                          }
                          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download .MP4</span>
                        </button>
                      </div>
                    ) : inAppMatches[0] ? (
                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onPlayMovie(inAppMatches[0])}
                          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Watch Matching Movie on App</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadMovie(inAppMatches[0])}
                          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download .MP4</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* PLAYABLE OUTSIDE-THE-APP MOVIE RESULTS GRID */}
              {outsideResult && outsideResult.outsideMovies.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base sm:text-lg font-bold text-white">
                      Playable Movies Found Outside the App ({outsideResult.outsideMovies.length})
                    </h3>
                    <span className="text-xs text-slate-400">
                      Streams directly inside TK STORYWORLD Player
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {outsideResult.outsideMovies.map((mov) => {
                      const inList = watchlistIds.has(mov.id);
                      return (
                        <div
                          key={mov.id}
                          onClick={() => onPlayMovie(mov)}
                          className="group rounded-xl bg-[#0E1118] border border-white/10 hover:border-[#E11D48] overflow-hidden transition-transform duration-150 hover:-translate-y-1 cursor-pointer flex flex-col"
                        >
                          <div className="relative aspect-video w-full bg-black overflow-hidden">
                            <CinemaPosterImage
                              src={mov.backdropUrl || mov.thumbnailUrl}
                              fallbackVideoId={mov.youtubeVideoId}
                              alt={mov.title}
                              category={mov.primaryCategory}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0E1118] via-black/15 to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-black/30">
                              <div className="w-11 h-11 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>
                            <div className="absolute bottom-2 right-2.5 text-[11px] font-mono tabular-nums text-white bg-black/80 px-2 py-0.5 rounded">
                              {mov.durationFormatted}
                            </div>
                          </div>

                          <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                            <div>
                              <h4 className="font-display text-sm font-bold text-white group-hover:text-[#F59E0B] line-clamp-2">
                                {mov.title}
                              </h4>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 truncate">
                                <span className="text-emerald-400 font-medium">
                                  {mov.releaseKind === 'full_movie'
                                    ? 'Full Movie'
                                    : 'Official Trailer'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{mov.channelTitle}</span>
                              </div>
                              <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                                {mov.synopsis}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlayMovie(mov);
                                }}
                                className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Watch Now</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDownloadMovie(mov);
                                }}
                                className="min-h-[38px] px-2.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer"
                                title="Download .MP4 to Device"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleWatchlist(mov.id);
                                }}
                                className="min-h-[38px] px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 cursor-pointer"
                                title={inList ? 'In Watchlist' : 'Save to Watchlist'}
                              >
                                {inList ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Bookmark className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MORE POPULAR MOVIES TO EXPLORE OUTSIDE THE APP */}
              {outsideResult && outsideResult.relatedSuggestions.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <div>
                    <h3 className="font-display text-base sm:text-lg font-bold text-white">
                      Explore More Popular Movies Outside the App
                    </h3>
                    <p className="text-xs text-slate-400">
                      Tap any movie below to discover streams, previews, and matching full movies
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {outsideResult.relatedSuggestions.map((item, idx) => (
                      <button
                        key={`${item.title}-${idx}`}
                        type="button"
                        onClick={() => handleQuickExplore(item.title)}
                        className="group text-left rounded-xl bg-[#0E1118] border border-white/10 hover:border-[#F59E0B] p-3.5 flex gap-3 items-start transition-colors cursor-pointer"
                      >
                        <div className="w-16 h-24 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#160A10] to-[#080B12] flex items-center justify-center">
                              <Film className="w-5 h-5 text-[#F59E0B]" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="font-display text-sm font-bold text-white group-hover:text-[#F59E0B] line-clamp-2">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {item.year ? `${item.year} · ` : ''}
                            {item.genre}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {item.whySimilar || item.synopsis}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

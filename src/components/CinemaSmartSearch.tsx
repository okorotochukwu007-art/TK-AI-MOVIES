import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronRight,
  Download,
  Film,
  Flame,
  Globe,
  Info,
  Loader2,
  Play,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  ExternalCatalogMovieItem,
  MovieAvailabilityStatus,
  MovieItem,
  SearchQueryMode,
  SearchSortOption,
  SearchSuggestionItem,
  VideoSourcePlatform,
} from '../types/cinema.ts';
import {
  buildLocalSearchSuggestions,
  compareMoviesByThreeTierPriority,
  computeTitleSimilarity,
  detectMovieCategoryIntent,
  detectNonMovieQuery,
  extractCanonicalMovieKey,
  findTypoCorrection,
  isClickbaitOrReviewVideo,
  isTokenMatch,
  matchesCategoryStrictly,
  normalizeSearchText,
  rankInAppMoviesForQuery,
  SUPPORTED_MOVIE_CATEGORIES,
} from '../utils/smartMovieSearch.ts';
import { resolveMovieSource } from '../utils/videoSource.ts';
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
  watchProviders?: Array<{ name: string; url: string }>;
  licensingNotice?: string | null;
  detectedIntent:
    | 'popular_movie'
    | 'genre_or_mood'
    | 'actor_or_director'
    | 'franchise'
    | 'plot_description'
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
  effectiveQuery?: string;
  correctedQuery?: string | null;
  queryMode?: SearchQueryMode;
  detectedCategory?: { id: string; label: string } | null;
  sort?: SearchSortOption;
  page?: number;
  totalPages?: number;
  totalResults?: number;
  hasMore?: boolean;
  isMovieQuery: boolean;
  rejectionReason: string | null;
  recognizedMovie: RecognizedPopularMovie | null;
  outsideMovies: OutsideAppMovieResult[];
  catalogMovies?: ExternalCatalogMovieItem[];
  sections?: {
    bestMatches: ExternalCatalogMovieItem[];
    latestMovies: ExternalCatalogMovieItem[];
    trendingMovies: ExternalCatalogMovieItem[];
    popularMovies: ExternalCatalogMovieItem[];
  };
  relatedSuggestions: SmartMovieSuggestion[];
  alternativeSuggestions?: string[];
  sourcesSearched?: string[];
  intelligenceNotice?: string | null;
}

interface CinemaSmartSearchProps {
  query: string;
  onQueryChange: (next: string) => void;
  inAppMatches: MovieItem[];
  allAppMovies?: MovieItem[];
  allAppMoviesCount: number;
  watchlistIds: Set<string>;
  onPlayMovie: (movie: MovieItem, contextQueue?: MovieItem[]) => void;
  onDownloadMovie: (movie: MovieItem) => void;
  onToggleWatchlist: (movieId: string) => void;
  variant: 'home' | 'categories';
  categoryLabel?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  renderInAppCard: (movie: MovieItem) => React.ReactNode;
}

const SORT_OPTIONS: Array<{ id: SearchSortOption; label: string }> = [
  { id: 'latest', label: 'Latest' },
  { id: 'trending', label: 'Trending' },
  { id: 'popular', label: 'Most Popular' },
  { id: 'top_rated', label: 'Top Rated' },
];

const AVAILABILITY_META: Record<
  MovieAvailabilityStatus,
  { label: string; textClass: string }
> = {
  FULL_MOVIE_AVAILABLE: {
    label: 'FULL MOVIE AVAILABLE',
    textClass: 'text-emerald-400',
  },
  TRAILER_AVAILABLE: {
    label: 'TRAILER AVAILABLE',
    textClass: 'text-amber-400',
  },
  EXTERNAL_STREAMING: {
    label: 'EXTERNAL STREAMING',
    textClass: 'text-sky-400',
  },
  COMING_SOON: {
    label: 'COMING SOON',
    textClass: 'text-rose-400',
  },
};

async function fetchJsonAbortable(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export const CinemaSmartSearch: React.FC<CinemaSmartSearchProps> = React.memo(({
  query,
  onQueryChange,
  inAppMatches,
  allAppMovies = [],
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [outsideResult, setOutsideResult] =
    useState<SmartMovieSearchResponse | null>(null);
  const [outsideError, setOutsideError] = useState<string | null>(null);
  const [outsideSourceFilter, setOutsideSourceFilter] = useState<
    'all' | VideoSourcePlatform
  >('all');
  const [showAllOutsideFull, setShowAllOutsideFull] = useState(false);
  const [activeSort, setActiveSort] = useState<SearchSortOption>('latest');
  const [skipCorrection, setSkipCorrection] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ExternalCatalogMovieItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [totalCatalogResults, setTotalCatalogResults] = useState(0);

  // Autocomplete suggestions state
  const [isFocused, setIsFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // On-demand trailer resolution state for TMDB external movie cards
  const [resolvingTrailerId, setResolvingTrailerId] = useState<string | null>(null);
  const [trailerFeedbackMap, setTrailerFeedbackMap] = useState<
    Record<string, { message: string; providers?: Array<{ name: string; url: string }> }>
  >({});

  const activeRequestIdRef = useRef(0);
  const lastSearchKeyRef = useRef('');
  const clientCacheRef = useRef(
    new Map<string, { ts: number; data: SmartMovieSearchResponse }>()
  );
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setCombinedInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      localInputRef.current = node;
      if (inputRef) {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    },
    [inputRef]
  );

  // Instant local input state so typing NEVER triggers a full App.tsx tree re-render per keystroke
  const [inputValue, setInputValue] = useState(query);
  const [debouncedSuggestValue, setDebouncedSuggestValue] = useState(query);
  const lastPushedQueryRef = useRef(query);

  // Only sync parent `query` -> `inputValue` when changed externally (never overwrite rapid typing!)
  useEffect(() => {
    if (query === lastPushedQueryRef.current) return;
    lastPushedQueryRef.current = query;
    setInputValue(query);
    setDebouncedSuggestValue(query);
  }, [query]);

  // Lightweight 110ms debounce for local autocomplete dropdown so rapid keystrokes stay strictly < 1ms
  useEffect(() => {
    if (!isFocused) return;
    const clean = inputValue.trim();
    if (clean.length < 2) {
      setDebouncedSuggestValue('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSuggestValue(clean);
    }, 110);
    return () => window.clearTimeout(timer);
  }, [inputValue, isFocused]);

  // Debounce pushing keystrokes up to parent App.tsx (420ms pause while typing; 0ms immediate on Enter/Submit/Clear)
  useEffect(() => {
    if (inputValue === lastPushedQueryRef.current) return;
    const delay = inputValue.trim() === '' ? 40 : 420;
    const timer = window.setTimeout(() => {
      lastPushedQueryRef.current = inputValue;
      startTransition(() => {
        onQueryChange(inputValue);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [inputValue, onQueryChange]);

  // Map in-app movie IDs for instant playback lookup when a TMDB card matches an in-app movie
  const inAppById = useMemo(() => {
    const map = new Map<string, MovieItem>();
    for (const m of allAppMovies) map.set(m.id, m);
    for (const m of inAppMatches) map.set(m.id, m);
    return map;
  }, [allAppMovies, inAppMatches]);

  // Zero-latency local suggestions (computed only after 110ms typing pause while dropdown is focused)
  const localSuggestions = useMemo(() => {
    if (!isFocused) return [];
    const clean = debouncedSuggestValue.trim();
    if (clean.length < 2) return [];
    return buildLocalSearchSuggestions(
      clean,
      allAppMovies.length > 0 ? allAppMovies : inAppMatches
    );
  }, [isFocused, debouncedSuggestValue, allAppMovies, inAppMatches]);

  // Merge zero-latency local suggestions with debounced remote TMDB movie-only suggestions
  const mergedSuggestions = useMemo(() => {
    if (!isFocused) return [];
    const out: SearchSuggestionItem[] = [];
    const seen = new Set<string>();
    const push = (s: SearchSuggestionItem) => {
      const k = normalizeSearchText(s.text);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(s);
    };
    for (const s of localSuggestions.filter(
      (x) => x.kind === 'correction' || x.kind === 'category' || x.kind === 'trending'
    )) {
      push(s);
    }
    for (const s of localSuggestions.filter((x) => x.inAppMovieId)) {
      push(s);
    }
    for (const s of remoteSuggestions) {
      push(s);
    }
    for (const s of localSuggestions) {
      push(s);
    }
    return out.slice(0, 8);
  }, [isFocused, localSuggestions, remoteSuggestions]);

  // Fetch debounced live TMDB movie-only suggestions after a short typing pause
  useEffect(() => {
    const clean = inputValue.trim();
    if (!isFocused || clean.length < 2) {
      setRemoteSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      if (detectNonMovieQuery(clean).isNonMovie) {
        setRemoteSuggestions([]);
        return;
      }
      try {
        const res = await fetchJsonAbortable(
          `/api/movies/search-suggestions?q=${encodeURIComponent(clean)}`,
          {},
          3500
        );
        if (!res.ok) return;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const data = (await res.json()) as { suggestions?: SearchSuggestionItem[] };
        if (Array.isArray(data.suggestions)) {
          setRemoteSuggestions(data.suggestions);
        }
      } catch {
        // Silently rely on zero-latency local suggestions
      }
    }, 340);

    return () => window.clearTimeout(timer);
  }, [inputValue, isFocused]);

  // Close dropdown on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setHighlightedIdx(-1);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Browser resilience fallback if server endpoint is temporarily unreachable
  const runBrowserFallback = useCallback(
    async (clean: string, reqId: number, sortChoice: SearchSortOption) => {
      const nonMovie = detectNonMovieQuery(clean);
      if (nonMovie.isNonMovie) {
        if (reqId !== activeRequestIdRef.current) return;
        setOutsideResult({
          query: clean,
          queryMode: 'non_movie',
          sort: sortChoice,
          page: 1,
          totalPages: 0,
          totalResults: 0,
          hasMore: false,
          isMovieQuery: false,
          rejectionReason:
            nonMovie.reason ||
            'TK STORYWORLD Search is exclusively for movies across all genres worldwide.',
          recognizedMovie: null,
          outsideMovies: [],
          catalogMovies: [],
          relatedSuggestions: [],
          alternativeSuggestions: [
            'Horror Movies',
            'Action Movies',
            'Nollywood Movies',
            'Latest 2026 Movies',
          ],
        });
        setCatalogItems([]);
        return;
      }

      const typo = findTypoCorrection(
        clean,
        allAppMovies.slice(0, 150).map((m) => m.title)
      );
      const searchTerm = typo?.corrected || clean;
      const catInfo = detectMovieCategoryIntent(searchTerm);

      try {
        const [dmRes, iaRes] = await Promise.all([
          fetchJsonAbortable(
            `https://api.dailymotion.com/videos?search=${encodeURIComponent(
              catInfo.category ? catInfo.category.dailymotionQuery : `${searchTerm} full movie`
            )}&fields=id,title,description,duration,thumbnail_720_url,owner.screenname,created_time,views_total,allow_embed&sort=${
              sortChoice === 'latest' ? 'recent' : 'relevance'
            }&limit=10&longer_than=25&flags=no_live`,
            {},
            5500
          ).catch(() => null),
          fetchJsonAbortable(
            `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
              `${searchTerm} AND mediatype:movies`
            )}&fl[]=identifier,title,description,downloads,year,creator&sort[]=downloads+desc&rows=8&output=json`,
            {},
            5500
          ).catch(() => null),
        ]);

        const dmMovies: OutsideAppMovieResult[] = [];
        const seenFallbackCanon = new Set<string>();

        if (dmRes && dmRes.ok) {
          const dmData = (await dmRes.json()) as { list?: any[] };
          for (const v of dmData?.list || []) {
            if (!v?.id || !v?.title || v.allow_embed === false) continue;
            const rawTitle = String(v.title);
            const rawDesc = String(v.description || '');
            if (isClickbaitOrReviewVideo(rawTitle, rawDesc)) continue;
            if (catInfo.category && !catInfo.category.isTrendingOrLatest) {
              const strictCheck = matchesCategoryStrictly(
                {
                  title: rawTitle,
                  synopsis: rawDesc,
                  channelTitle: String(v['owner.screenname'] || ''),
                },
                catInfo.category
              );
              if (!strictCheck.matched) continue;
            }
            const canonKey = extractCanonicalMovieKey(rawTitle);
            if (canonKey && seenFallbackCanon.has(canonKey)) continue;
            if (canonKey) seenFallbackCanon.add(canonKey);

            const dur = Math.max(1500, Number(v.duration) || 3600);
            const mins = Math.floor(dur / 60);
            const secs = dur % 60;
            dmMovies.push({
              id: `ext-dm-${v.id}`,
              youtubeVideoId: `dm:${v.id}`,
              sourcePlatform: 'dailymotion',
              externalVideoId: String(v.id),
              embedUrl: `https://geo.dailymotion.com/player.html?video=${encodeURIComponent(
                String(v.id)
              )}&autoplay=1&ui-logo=false&sharing-enable=false&queue-enable=false`,
              title: rawTitle,
              synopsis: String(rawDesc || `Full movie stream for "${searchTerm}".`).slice(0, 220),
              thumbnailUrl: String(v.thumbnail_720_url || ''),
              backdropUrl: String(v.thumbnail_720_url || ''),
              primaryCategory: 'New Movies',
              secondaryCategories: ['New Movies'],
              channelTitle: String(v['owner.screenname'] || 'TK STORYWORLD Cinema'),
              channelId: '',
              publishedAt: v.created_time
                ? new Date(Number(v.created_time) * 1000).toISOString()
                : new Date().toISOString(),
              durationSeconds: dur,
              durationFormatted: `${mins}:${String(secs).padStart(2, '0')}`,
              viewCount: Number(v.views_total) || 85000,
              likeCount: 6400,
              commentsCount: 410,
              hookTag: 'Full Movie · HD',
              isEmbeddable: true,
              playbackStatus: 'active',
              approvalStatus: 'approved',
              isFeatured: false,
              seriesId: null,
              seasonNumber: null,
              episodeNumber: null,
              discoveredVia: 'dailymotion_api',
              aiQualityScore: 88,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              releaseKind: 'full_movie',
              externalGenreLabel: catInfo.category?.label || 'Feature Film',
              releaseYear: v.created_time
                ? String(new Date(Number(v.created_time) * 1000).getUTCFullYear())
                : '',
              sourcePlatformLabel: 'Full Feature · HD',
            });
          }
        }

        if (iaRes && iaRes.ok) {
          const iaData = (await iaRes.json()) as { response?: { docs?: any[] } };
          for (const doc of iaData?.response?.docs || []) {
            if (!doc?.identifier || !doc?.title) continue;
            const iaId = String(doc.identifier);
            const rawTitle = String(doc.title);
            const rawDesc = String(doc.description || '');
            const canonKey = extractCanonicalMovieKey(rawTitle);
            if (canonKey && seenFallbackCanon.has(canonKey)) continue;
            if (canonKey) seenFallbackCanon.add(canonKey);

            const year = String(doc.year || '2026');
            const creator = String(doc.creator || 'Internet Archive Cinema');
            const downloads = Number(doc.downloads) || 150000;

            dmMovies.push({
              id: `ext-ia-${iaId}`,
              youtubeVideoId: `ia:${iaId}`,
              sourcePlatform: 'archive',
              externalVideoId: iaId,
              embedUrl: `https://archive.org/embed/${encodeURIComponent(iaId)}`,
              title: rawTitle,
              synopsis: rawDesc.slice(0, 220) || `Classic archival movie stream for "${rawTitle}".`,
              thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(iaId)}`,
              backdropUrl: `https://archive.org/services/img/${encodeURIComponent(iaId)}`,
              primaryCategory: 'New Movies',
              secondaryCategories: ['New Movies'],
              channelTitle: creator,
              channelId: '',
              publishedAt: `${year}-01-01T00:00:00Z`,
              durationSeconds: 5400,
              durationFormatted: '1:30:00',
              viewCount: downloads,
              likeCount: Math.round(downloads * 0.05),
              commentsCount: Math.round(downloads * 0.005),
              hookTag: '🏛️ Archive Cinema · Full',
              isEmbeddable: true,
              playbackStatus: 'active',
              approvalStatus: 'approved',
              isFeatured: false,
              seriesId: null,
              seasonNumber: null,
              episodeNumber: null,
              discoveredVia: 'internet_archive_api',
              aiQualityScore: 90,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              releaseKind: 'full_movie',
              externalGenreLabel: 'Archival Masterpiece',
              releaseYear: year,
              sourcePlatformLabel: 'Archive HD',
            });
          }
        }

        dmMovies.sort((a, b) => compareMoviesByThreeTierPriority(a, b));

        if (reqId !== activeRequestIdRef.current) return;
        setOutsideResult({
          query: clean,
          effectiveQuery: searchTerm,
          correctedQuery: typo?.corrected || null,
          queryMode: catInfo.category ? 'category' : typo ? 'typo_or_partial' : 'exact_title',
          detectedCategory: catInfo.category
            ? { id: catInfo.category.id, label: catInfo.category.label }
            : null,
          sort: sortChoice,
          page: 1,
          totalPages: 1,
          totalResults: dmMovies.length,
          hasMore: false,
          isMovieQuery: true,
          rejectionReason: null,
          recognizedMovie: null,
          outsideMovies: dmMovies,
          catalogMovies: [],
          relatedSuggestions: [],
          sourcesSearched: ['Dailymotion', 'Internet Archive'],
          intelligenceNotice: 'Connected to live multi-source stream search.',
        });
        setCatalogItems([]);
      } catch {
        if (reqId === activeRequestIdRef.current) {
          setOutsideError('External movie catalogue is temporarily busy. Showing available TK STORYWORLD matches.');
        }
      }
    },
    [allAppMovies]
  );

  // Execute unified smart search against backend
  const runSmartSearch = useCallback(
    async (
      rawQuery: string,
      opts: {
        sort?: SearchSortOption;
        page?: number;
        skipCorrectionOverride?: boolean;
        force?: boolean;
        append?: boolean;
      } = {}
    ) => {
      const clean = rawQuery.trim();
      if (clean.length < 2) {
        setOutsideResult(null);
        setOutsideError(null);
        setCatalogItems([]);
        setCurrentPage(1);
        setHasMorePages(false);
        setTotalCatalogResults(0);
        setIsSearchingOutside(false);
        setIsLoadingMore(false);
        lastSearchKeyRef.current = '';
        return;
      }

      const catDetection = detectMovieCategoryIntent(clean);
      const effectiveSort =
        opts.sort || (opts.force || !opts.append ? catDetection.preferredSort : activeSort);
      const targetPage = Math.max(1, opts.page || 1);
      const shouldSkipCorr =
        opts.skipCorrectionOverride !== undefined
          ? opts.skipCorrectionOverride
          : skipCorrection;

      const requestKey = `${normalizeSearchText(clean)}|${effectiveSort}|p${targetPage}|skip:${shouldSkipCorr}`;
      if (!opts.force && !opts.append && lastSearchKeyRef.current === requestKey) {
        return;
      }

      // Check client cache (4 min TTL)
      const cached = clientCacheRef.current.get(requestKey);
      if (cached && Date.now() - cached.ts < 4 * 60 * 1000 && !opts.append) {
        lastSearchKeyRef.current = requestKey;
        setActiveSort(cached.data.sort || effectiveSort);
        setOutsideResult(cached.data);
        setCatalogItems(cached.data.catalogMovies || []);
        setCurrentPage(cached.data.page || 1);
        setHasMorePages(Boolean(cached.data.hasMore));
        setTotalCatalogResults(cached.data.totalResults || (cached.data.catalogMovies?.length || 0));
        setOutsideError(null);
        setIsSearchingOutside(false);
        return;
      }

      const reqId = ++activeRequestIdRef.current;
      if (!opts.append) {
        lastSearchKeyRef.current = requestKey;
        setActiveSort(effectiveSort);
        setIsSearchingOutside(true);
        setOutsideError(null);
        setOutsideSourceFilter('all');
      } else {
        setIsLoadingMore(true);
      }

      try {
        const res = await fetchJsonAbortable(
          '/api/movies/smart-search',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: clean,
              sort: effectiveSort,
              page: targetPage,
              skipCorrection: shouldSkipCorr,
            }),
          },
          16000
        );
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = (await res.json()) as SmartMovieSearchResponse & { error?: string };
          if (reqId !== activeRequestIdRef.current) return;
          if (!res.ok) {
            setOutsideError(data.error || 'Unable to reach global movie search right now.');
            return;
          }

          if (opts.append) {
            setCatalogItems((prev) => {
              const seen = new Set(prev.map((x) => x.tmdbId));
              const next = (data.catalogMovies || []).filter((x) => !seen.has(x.tmdbId));
              return [...prev, ...next];
            });
            setCurrentPage(data.page || targetPage);
            setHasMorePages(Boolean(data.hasMore));
            setTotalCatalogResults(data.totalResults || 0);
          } else {
            clientCacheRef.current.set(requestKey, { ts: Date.now(), data });
            setOutsideResult(data);
            setCatalogItems(data.catalogMovies || []);
            setCurrentPage(data.page || 1);
            setHasMorePages(Boolean(data.hasMore));
            setTotalCatalogResults(
              data.totalResults || (data.catalogMovies?.length || 0)
            );
            setOutsideError(null);
          }
          return;
        }
      } catch {
        // fall through to browser fallback for page 1
      } finally {
        if (reqId === activeRequestIdRef.current) {
          setIsSearchingOutside(false);
          setIsLoadingMore(false);
        }
      }

      if (!opts.append) {
        await runBrowserFallback(clean, reqId, effectiveSort);
      }
    },
    [activeSort, skipCorrection, runBrowserFallback]
  );

  // Debounced auto-search as query changes
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      activeRequestIdRef.current += 1;
      lastSearchKeyRef.current = '';
      setOutsideResult(null);
      setOutsideError(null);
      setCatalogItems([]);
      setCurrentPage(1);
      setHasMorePages(false);
      setTotalCatalogResults(0);
      setIsSearchingOutside(false);
      setSkipCorrection(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const catHint = detectMovieCategoryIntent(clean);
      void runSmartSearch(clean, {
        sort: catHint.preferredSort,
        page: 1,
        skipCorrectionOverride: false,
      });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = inputValue.trim();
    if (clean.length < 2) return;
    setIsFocused(false);
    setHighlightedIdx(-1);
    setSkipCorrection(false);
    if (inputValue !== lastPushedQueryRef.current) {
      lastPushedQueryRef.current = inputValue;
      onQueryChange(inputValue);
    }
    const catHint = detectMovieCategoryIntent(clean);
    void runSmartSearch(clean, {
      sort: catHint.preferredSort,
      page: 1,
      skipCorrectionOverride: false,
      force: true,
    });
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 90);
  };

  const handleSelectSuggestion = (s: SearchSuggestionItem) => {
    setIsFocused(false);
    setHighlightedIdx(-1);
    if (s.inAppMovieId) {
      const found = inAppById.get(s.inAppMovieId);
      if (found) {
        onPlayMovie(found);
        return;
      }
    }
    setSkipCorrection(false);
    lastPushedQueryRef.current = s.text;
    setInputValue(s.text);
    onQueryChange(s.text);
    const catHint = detectMovieCategoryIntent(s.text);
    void runSmartSearch(s.text, {
      sort: catHint.preferredSort,
      page: 1,
      skipCorrectionOverride: false,
      force: true,
    });
  };

  const handleShortcutClick = (term: string) => {
    setIsFocused(false);
    setHighlightedIdx(-1);
    setSkipCorrection(false);
    lastPushedQueryRef.current = term;
    setInputValue(term);
    onQueryChange(term);
    const catHint = detectMovieCategoryIntent(term);
    void runSmartSearch(term, {
      sort: catHint.preferredSort,
      page: 1,
      skipCorrectionOverride: false,
      force: true,
    });
  };

  const handleSortChange = (nextSort: SearchSortOption) => {
    const activeQ = (inputValue || query).trim();
    if (nextSort === activeSort || !activeQ) return;
    setActiveSort(nextSort);
    void runSmartSearch(activeQ, {
      sort: nextSort,
      page: 1,
      skipCorrectionOverride: skipCorrection,
      force: true,
    });
  };

  const handleLoadMore = () => {
    const activeQ = (inputValue || query).trim();
    if (!hasMorePages || isLoadingMore || !activeQ) return;
    void runSmartSearch(activeQ, {
      sort: activeSort,
      page: currentPage + 1,
      skipCorrectionOverride: skipCorrection,
      append: true,
    });
  };

  const handleClearSearch = () => {
    activeRequestIdRef.current += 1;
    lastSearchKeyRef.current = '';
    lastPushedQueryRef.current = '';
    setInputValue('');
    onQueryChange('');
    setOutsideResult(null);
    setOutsideError(null);
    setCatalogItems([]);
    setRemoteSuggestions([]);
    setSkipCorrection(false);
    setIsFocused(false);
    localInputRef.current?.focus();
  };

  // Play an external TMDB discovery movie:
  // - If verified in-app full movie exists, play the full movie.
  // - Otherwise resolve its official YouTube trailer and play it transparently labeled as Official Trailer.
  const handlePlayCatalogMovie = async (item: ExternalCatalogMovieItem) => {
    if (item.matchedInAppMovieId) {
      const inAppMovie = inAppById.get(item.matchedInAppMovieId);
      if (inAppMovie) {
        onPlayMovie(inAppMovie);
        return;
      }
    }

    const launchTrailer = (videoId: string, providers?: Array<{ name: string; url: string }>) => {
      const trailerMovie: MovieItem = {
        id: `tmdb-trailer-${item.tmdbId}-${videoId}`,
        youtubeVideoId: videoId,
        sourcePlatform: 'youtube',
        externalVideoId: videoId,
        releaseKind: 'official_trailer',
        tmdbId: item.tmdbId,
        releaseDate: item.releaseDate,
        voteAverage: item.rating,
        watchProviders: providers || [
          { name: 'TMDB Watch Options', url: item.externalWatchUrl },
          { name: 'JustWatch', url: item.justWatchUrl },
        ],
        title: `${item.title}${item.releaseYear ? ` (${item.releaseYear})` : ''} — Official Trailer`,
        synopsis:
          item.overview ||
          `Official trailer for ${item.title}. Full movie available via authorized streaming platforms.`,
        thumbnailUrl: item.posterUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        backdropUrl: item.backdropUrl || item.posterUrl || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        primaryCategory: 'New Movies',
        secondaryCategories: ['New Movies'],
        channelTitle: 'Official Studio Trailer',
        channelId: '',
        publishedAt: item.releaseDate || new Date().toISOString(),
        durationSeconds: 150,
        durationFormatted: '2:30',
        viewCount: Math.max(10000, Math.round(item.popularity * 5000)),
        likeCount: Math.max(1000, item.voteCount * 20),
        hookTag: 'Official Trailer · External Release',
        isEmbeddable: true,
        playbackStatus: 'active',
        approvalStatus: 'approved',
        isFeatured: false,
        seriesId: null,
        seasonNumber: null,
        episodeNumber: null,
        discoveredVia: 'tmdb_2026',
        aiQualityScore: Math.min(99, Math.max(70, Math.round(item.rating * 10))),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onPlayMovie(trailerMovie);
    };

    if (item.trailerVideoId) {
      launchTrailer(item.trailerVideoId);
      return;
    }

    try {
      setResolvingTrailerId(item.id);
      const res = await fetchJsonAbortable(
        `/api/movies/resolve-trailer?tmdbId=${encodeURIComponent(
          String(item.tmdbId)
        )}&title=${encodeURIComponent(item.title)}&year=${encodeURIComponent(
          item.releaseYear || ''
        )}`,
        {},
        7000
      );
      if (res.ok) {
        const data = (await res.json()) as {
          videoId?: string | null;
          watchProviders?: Array<{ name: string; url: string }>;
        };
        if (data.videoId) {
          // Cache resolved trailerVideoId onto item in state so future clicks are instant
          setCatalogItems((prev) =>
            prev.map((c) =>
              c.id === item.id
                ? {
                    ...c,
                    trailerVideoId: data.videoId || undefined,
                    availabilityStatus:
                      c.availabilityStatus === 'COMING_SOON'
                        ? 'COMING_SOON'
                        : 'TRAILER_AVAILABLE',
                  }
                : c
            )
          );
          launchTrailer(data.videoId, data.watchProviders);
          return;
        }
        setTrailerFeedbackMap((prev) => ({
          ...prev,
          [item.id]: {
            message: 'Trailer is currently unavailable in-app — check back soon.',
          },
        }));
        return;
      }
    } catch {
      setTrailerFeedbackMap((prev) => ({
        ...prev,
        [item.id]: {
          message: 'Trailer lookup timed out — please tap Watch Trailer again.',
        },
      }));
    } finally {
      setResolvingTrailerId(null);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isFocused || mergedSuggestions.length === 0) {
      if (e.key === 'Escape') setIsFocused(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev + 1) % mergedSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        prev <= 0 ? mergedSuggestions.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter' && highlightedIdx >= 0 && mergedSuggestions[highlightedIdx]) {
      e.preventDefault();
      handleSelectSuggestion(mergedSuggestions[highlightedIdx]);
    } else if (e.key === 'Escape') {
      setIsFocused(false);
      setHighlightedIdx(-1);
    }
  };

  const filteredInAppMatches = useMemo(() => {
    const clean = query.trim();
    const targetMovies = allAppMovies.length > 0 ? allAppMovies : inAppMatches;
    if (clean.length < 2) return inAppMatches;
    const catIntent = detectMovieCategoryIntent(clean);
    if (catIntent.category) return inAppMatches;

    return rankInAppMoviesForQuery(targetMovies, clean);
  }, [allAppMovies, inAppMatches, query]);

  const isActiveSearch = query.trim().length >= 2;
  const recognized = outsideResult?.recognizedMovie;
  const outsideMovies = useMemo(() => {
    const raw = outsideResult?.outsideMovies || [];
    if (raw.length === 0) return [];
    const inAppIds = new Set(filteredInAppMatches.map((m) => m.youtubeVideoId || m.id));
    const inAppCanon = new Set(
      filteredInAppMatches.map((m) => extractCanonicalMovieKey(m.title)).filter(Boolean)
    );
    const seenCanon = new Set<string>();
    return raw.filter((m) => {
      if (inAppIds.has(m.youtubeVideoId || m.id)) return false;
      const canon = extractCanonicalMovieKey(m.title);
      if (canon && (inAppCanon.has(canon) || seenCanon.has(canon))) return false;
      if (canon) seenCanon.add(canon);
      return true;
    });
  }, [outsideResult?.outsideMovies, filteredInAppMatches]);

  const sourcePlatformCounts = useMemo(() => {
    const counts: Record<VideoSourcePlatform, number> = {
      youtube: 0,
      dailymotion: 0,
      vimeo: 0,
      archive: 0,
    };
    for (const m of outsideMovies) {
      const p = resolveMovieSource(m).platform;
      counts[p] = (counts[p] || 0) + 1;
    }
    return counts;
  }, [outsideMovies]);

  const filteredOutsideMovies = useMemo(() => {
    const base =
      outsideSourceFilter === 'all'
        ? outsideMovies
        : outsideMovies.filter(
            (m) => resolveMovieSource(m).platform === outsideSourceFilter
          );
    // Guarantee Full Movies ALWAYS render before Official Trailers
    const full = base.filter((m) => m.releaseKind === 'full_movie');
    const trailers = base.filter((m) => m.releaseKind !== 'full_movie');
    return [...full, ...trailers];
  }, [outsideMovies, outsideSourceFilter]);

  const filteredOutsideFullMovies = useMemo(
    () => filteredOutsideMovies.filter((m) => m.releaseKind === 'full_movie'),
    [filteredOutsideMovies]
  );

  const visibleOutsideFullMovies = useMemo(
    () =>
      showAllOutsideFull
        ? filteredOutsideFullMovies
        : filteredOutsideFullMovies.slice(0, 16),
    [filteredOutsideFullMovies, showAllOutsideFull]
  );

  useEffect(() => {
    setShowAllOutsideFull(false);
  }, [query, outsideSourceFilter]);

  const filteredOutsideTrailers = useMemo(
    () => filteredOutsideMovies.filter((m) => m.releaseKind !== 'full_movie'),
    [filteredOutsideMovies]
  );

  const relatedSuggestions = outsideResult?.relatedSuggestions || [];
  const hasZeroResults =
    isActiveSearch &&
    !isSearchingOutside &&
    outsideResult?.isMovieQuery !== false &&
    inAppMatches.length === 0 &&
    outsideMovies.length === 0 &&
    catalogItems.length === 0 &&
    !recognized;

  // Render a clean, Netflix-style external TMDB discovery poster card
  const renderCatalogPosterCard = (item: ExternalCatalogMovieItem) => {
    const avail = AVAILABILITY_META[item.availabilityStatus];
    const isResolving = resolvingTrailerId === item.id;
    const feedback = trailerFeedbackMap[item.id];
    const isInAppFull =
      item.availabilityStatus === 'FULL_MOVIE_AVAILABLE' && Boolean(item.matchedInAppMovieId);

    return (
      <article
        key={item.id}
        className="group flex flex-col rounded-xl overflow-hidden bg-[#0E1118] border border-white/10 hover:border-white/25 transition-colors"
      >
        <div className="relative aspect-[2/3] bg-black overflow-hidden">
          {item.posterUrl ? (
            <img
              src={item.posterUrl}
              alt={item.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <CinemaPosterImage
              src={item.backdropUrl || ''}
              fallbackVideoId=""
              alt={item.title}
              category={item.genres[0] || 'New Movies'}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1118] via-black/25 to-transparent" />

          {/* Clean top-right rating text (no pill clutter) */}
          {item.rating > 0 && (
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[11px] font-mono font-semibold text-amber-400 tabular-nums flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}

          {/* Bottom overlay quick play button */}
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <span
              className={`text-[10px] font-semibold tracking-wider uppercase drop-shadow ${avail.textClass}`}
            >
              {avail.label}
            </span>
          </div>
        </div>

        <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <h4 className="font-display text-sm font-bold text-white line-clamp-2 leading-snug">
              {item.title}
            </h4>
            {/* Unboxed metadata with typographic separators */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              {item.releaseYear && (
                <span className="font-mono tabular-nums text-slate-300">
                  {item.releaseYear}
                </span>
              )}
              {item.releaseYear && item.genres.length > 0 && (
                <span aria-hidden="true">·</span>
              )}
              {item.genres.length > 0 && (
                <span className="truncate">{item.genres.slice(0, 2).join(' / ')}</span>
              )}
            </div>
            {item.matchReason ? (
              <p className="text-[11px] text-amber-300/90 line-clamp-2 leading-relaxed">
                {item.matchReason}
              </p>
            ) : item.overview ? (
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {item.overview}
              </p>
            ) : null}
          </div>

          {feedback && (
            <p className="text-[11px] text-amber-300 leading-snug">{feedback.message}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handlePlayCatalogMovie(item)}
              disabled={isResolving}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                isInAppFull
                  ? 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
                  : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
              }`}
            >
              {isResolving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>
                {isInAppFull
                  ? 'Watch Full Movie'
                  : isResolving
                  ? 'Loading...'
                  : 'Watch Trailer'}
              </span>
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div ref={containerRef} className="space-y-6">
      {/* PREMIUM INTELLIGENT MOVIE SEARCH CONSOLE */}
      <div className="rounded-2xl bg-[#0B0E15] border border-white/15 p-4 sm:p-5 space-y-3.5 shadow-xl shadow-black/40">
        {variant !== 'home' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Film className="w-4 h-4 text-[#E11D48] shrink-0" />
              <span className="font-semibold text-white">
                Intelligent Movie Search Engine
              </span>
              <span className="hidden sm:inline text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline text-slate-400">
                Movies, 2026 Series, genres &amp; plot descriptions
              </span>
            </div>
            {isActiveSearch && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Reset search
              </button>
            )}
          </div>
        ) : isActiveSearch ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClearSearch}
              className="text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Reset search
            </button>
          </div>
        ) : null}

        {/* Search Input + Instant Autocomplete Dropdown */}
        <div className="relative">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={setCombinedInputRef}
                type="text"
                value={inputValue}
                onFocus={() => setIsFocused(true)}
                onKeyDown={handleInputKeyDown}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setIsFocused(true);
                  setHighlightedIdx(-1);
                }}
                placeholder='Search 2026 movies, series ("2026 series"), genres ("Horror Movies"), or describe a plot...'
                aria-label="Search movies and 2026 series across TK STORYWORLD"
                autoComplete="off"
                className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-[#050609] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48] transition-colors"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={inputValue.trim().length < 2 || isSearchingOutside}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSearchingOutside ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Search Movies</span>
                </>
              )}
            </button>
          </form>

          {/* INSTANT SMART SUGGESTIONS DROPDOWN */}
          {isFocused && inputValue.trim().length >= 2 && mergedSuggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Smart movie search suggestions"
              className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl bg-[#0C0F17] border border-white/15 shadow-2xl shadow-black/80 overflow-hidden divide-y divide-white/5"
            >
              {mergedSuggestions.map((s, idx) => {
                const isSelected = idx === highlightedIdx;
                const availMeta = s.availabilityStatus
                  ? AVAILABILITY_META[s.availabilityStatus]
                  : null;
                return (
                  <button
                    key={`${s.kind}-${s.text}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectSuggestion(s)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {s.posterUrl ? (
                        <img
                          src={s.posterUrl}
                          alt={s.text}
                          referrerPolicy="no-referrer"
                          className="w-8 h-11 rounded object-cover shrink-0 bg-black"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                          {s.kind === 'correction' ? (
                            <Sparkles className="w-4 h-4 text-amber-400" />
                          ) : s.kind === 'trending' ? (
                            <TrendingUp className="w-4 h-4 text-[#E11D48]" />
                          ) : s.kind === 'category' ? (
                            <Film className="w-4 h-4 text-slate-300" />
                          ) : (
                            <Search className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {s.text}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                          {s.subtitle && <span>{s.subtitle}</span>}
                          {s.rating && s.rating > 0 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-amber-400">
                                ★ {s.rating.toFixed(1)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {availMeta && (
                        <span
                          className={`hidden sm:inline text-[10px] font-semibold tracking-wider uppercase ${availMeta.textClass}`}
                        >
                          {availMeta.label}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SEARCH RESULTS WORKSPACE */}
      {isActiveSearch && (
        <div ref={resultsSectionRef} className="space-y-8 scroll-mt-24">
          {/* TYPO CORRECTION BANNER */}
          {outsideResult?.correctedQuery &&
            !skipCorrection &&
            normalizeSearchText(outsideResult.correctedQuery) !==
              normalizeSearchText(query) && (
              <div className="rounded-xl bg-[#0E1118] border border-amber-500/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-200">
                  Showing movie results for{' '}
                  <button
                    type="button"
                    onClick={() => handleShortcutClick(outsideResult.correctedQuery!)}
                    className="font-semibold text-amber-400 hover:underline cursor-pointer"
                  >
                    &ldquo;{outsideResult.correctedQuery}&rdquo;
                  </button>
                  <span className="text-slate-400 ml-2 text-xs">
                    (corrected from &ldquo;{query.trim()}&rdquo;)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSkipCorrection(true);
                    void runSmartSearch(query, {
                      sort: activeSort,
                      page: 1,
                      skipCorrectionOverride: true,
                      force: true,
                    });
                  }}
                  className="text-xs font-medium text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Search instead for &ldquo;{query.trim()}&rdquo;
                </button>
              </div>
            )}

          {/* STRICT MOVIES-ONLY REJECTION BANNER */}
          {outsideResult && !outsideResult.isMovieQuery && (
            <div className="rounded-2xl bg-[#0E1118] border border-rose-500/35 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-display text-base font-bold text-white">
                    Movies-Only Search Engine
                  </h3>
                  <p className="text-sm text-slate-300">
                    {outsideResult.rejectionReason}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-400">Try a movie search:</span>
                {(
                  outsideResult.alternativeSuggestions || [
                    'Horror Movies',
                    'Action Movies',
                    'Nollywood Movies',
                    'Latest 2026 Movies',
                  ]
                ).map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    onClick={() => handleShortcutClick(alt)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    {alt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CATEGORY / PLOT / GLOBAL HEADER & SORT CONTROLS */}
          {outsideResult?.isMovieQuery !== false && (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-white/10">
              <div className="space-y-1">
                <div className="text-xs font-medium text-[#F59E0B]">
                  {outsideResult?.detectedCategory
                    ? 'Movie Category Discovery · Global & In-App Catalogue'
                    : outsideResult?.queryMode === 'plot_description'
                    ? 'Plot & Storyline Match · Verified Movies'
                    : 'Unified Movie Search · Inside & Outside TK STORYWORLD'}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {outsideResult?.detectedCategory
                    ? outsideResult.detectedCategory.label
                    : `Results for "${outsideResult?.correctedQuery || query.trim()}"`}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span>{inAppMatches.length} in TK STORYWORLD</span>
                  <span aria-hidden="true">·</span>
                  <span>{outsideMovies.length} playable streams outside app</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {totalCatalogResults > 0
                      ? `${totalCatalogResults.toLocaleString()} verified global movies`
                      : `${catalogItems.length} global listings`}
                  </span>
                </div>
              </div>

              {/* Interactive Sort Segmented Control (Latest default for categories) */}
              <div
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0E1118] border border-white/10 self-start md:self-auto"
                role="tablist"
                aria-label="Sort movie search results"
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={activeSort === opt.id}
                    onClick={() => handleSortChange(opt.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeSort === opt.id
                        ? 'bg-[#E11D48] text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LOADING SKELETON WHEN SEARCHING */}
          {isSearchingOutside && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-sm text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                <span>
                  Searching TK STORYWORLD &amp; global movie catalogue...
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[#0E1118] border border-white/10 overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[2/3] bg-white/[0.04]" />
                    <div className="p-3.5 space-y-2">
                      <div className="h-3.5 w-3/4 rounded bg-white/[0.06]" />
                      <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ERROR NOTICE (NON-CRASHING) */}
          {outsideError && (
            <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{outsideError}</span>
            </div>
          )}

          {/* 1. RECOGNIZED MOVIE SPOTLIGHT (FOR TITLE / FRANCHISE / TOP PLOT MATCH) */}
          {recognized && outsideResult?.isMovieQuery && (
            <section className="rounded-2xl bg-[#0E1118] border border-white/15 p-5 sm:p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {recognized.posterUrl && (
                  <div className="w-32 sm:w-40 shrink-0 rounded-xl overflow-hidden bg-black border border-white/10 self-start">
                    <img
                      src={recognized.posterUrl}
                      alt={recognized.canonicalTitle}
                      referrerPolicy="no-referrer"
                      className="w-full aspect-[2/3] object-cover"
                    />
                  </div>
                )}

                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-amber-400">Top Movie Match</span>
                    {recognized.releaseYear && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          {recognized.releaseYear}
                        </span>
                      </>
                    )}
                    {recognized.allGenres?.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{recognized.allGenres.slice(0, 3).join(' / ')}</span>
                      </>
                    )}
                    {recognized.runtimeLabel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{recognized.runtimeLabel}</span>
                      </>
                    )}
                  </div>

                  <h3 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
                    {recognized.canonicalTitle}
                  </h3>

                  {recognized.synopsis && (
                    <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
                      {recognized.synopsis}
                    </p>
                  )}

                  {(recognized.directorOrStudio || recognized.castHighlights) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                      {recognized.directorOrStudio && (
                        <span>
                          <strong className="text-slate-200">Studio / Director:</strong>{' '}
                          {recognized.directorOrStudio}
                        </span>
                      )}
                      {recognized.castHighlights && (
                        <span>
                          <strong className="text-slate-200">Cast:</strong>{' '}
                          {recognized.castHighlights}
                        </span>
                      )}
                    </div>
                  )}

                  {recognized.licensingNotice && (
                    <p className="text-xs text-amber-300/90 leading-relaxed pt-1">
                      {recognized.licensingNotice
                        .replace(/\b(YouTube|Dailymotion|Vimeo|Internet Archive|TMDB)\b/gi, 'our streaming partners')
                        .replace(/(?:our streaming partners(?:,\s*|\s*&\s*|\s+and\s+))+our streaming partners/gi, 'our streaming partners')}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 2. MOVIES ALREADY AVAILABLE TO WATCH (IN-APP TK STORYWORLD) */}
          {filteredInAppMatches.length > 0 && outsideResult?.isMovieQuery !== false && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-emerald-400">
                    FULL MOVIE AVAILABLE · IN TK STORYWORLD
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-0.5">
                    Movies Already Available to Watch ({filteredInAppMatches.length})
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {filteredInAppMatches.slice(0, variant === 'categories' ? 24 : 8).map((m) => (
                  <React.Fragment key={m.id}>{renderInAppCard(m)}</React.Fragment>
                ))}
              </div>
            </section>
          )}

          {/* 3. VERIFIED PLAYABLE STREAMS OUTSIDE THE APP (YOUTUBE, DAILYMOTION, VIMEO) */}
          {outsideMovies.length > 0 && outsideResult?.isMovieQuery !== false && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-amber-400">
                    {filteredOutsideFullMovies.length > 0
                      ? 'FULL MOVIES FIRST · PLAYABLE IN APP'
                      : 'OFFICIAL TRAILERS · PLAYABLE IN APP'}
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-0.5">
                    {filteredOutsideFullMovies.length > 0
                      ? `Playable Full Movies (${filteredOutsideFullMovies.length})`
                      : `Official Trailers (${filteredOutsideTrailers.length})`}
                  </h3>
                </div>

                {/* Stream Server Segmented Filter */}
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0E1118] border border-white/10 self-start sm:self-auto">
                  {(
                    [
                      { id: 'all', label: `All (${outsideMovies.length})` },
                      ...(sourcePlatformCounts.youtube > 0
                        ? [{ id: 'youtube', label: `HD Server 1 (${sourcePlatformCounts.youtube})` }]
                        : []),
                      ...(sourcePlatformCounts.dailymotion > 0
                        ? [
                            {
                              id: 'dailymotion',
                              label: `HD Server 2 (${sourcePlatformCounts.dailymotion})`,
                            },
                          ]
                        : []),
                      ...(sourcePlatformCounts.vimeo > 0
                        ? [{ id: 'vimeo', label: `HD Server 3 (${sourcePlatformCounts.vimeo})` }]
                        : []),
                      ...(sourcePlatformCounts.archive > 0
                        ? [{ id: 'archive', label: `HD Server 4 (${sourcePlatformCounts.archive})` }]
                        : []),
                    ] as Array<{ id: 'all' | VideoSourcePlatform; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOutsideSourceFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        outsideSourceFilter === tab.id
                          ? 'bg-white text-black font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOutsideFullMovies.length > 0 && (
                <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {visibleOutsideFullMovies.map((movie) => {
                    const inList = watchlistIds.has(movie.id);
                    const availMeta = AVAILABILITY_META.FULL_MOVIE_AVAILABLE;

                    return (
                      <article
                        key={movie.id}
                        className="group rounded-xl overflow-hidden bg-[#0E1118] border border-white/10 hover:border-white/25 transition-colors flex flex-col"
                      >
                        <div
                          onClick={() =>
                            onPlayMovie(movie, [...inAppMatches, ...filteredOutsideFullMovies])
                          }
                          className="relative aspect-video bg-black overflow-hidden cursor-pointer"
                        >
                          <CinemaPosterImage
                            src={movie.thumbnailUrl}
                            fallbackVideoId={movie.youtubeVideoId}
                            alt={movie.title}
                            category={movie.primaryCategory}
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-12 h-12 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                          <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2 text-[11px]">
                            <span
                              className={`font-semibold tracking-wider uppercase ${availMeta.textClass}`}
                            >
                              {availMeta.label}
                            </span>
                            <span className="font-mono tabular-nums text-white/90 bg-black/70 px-1.5 py-0.5 rounded">
                              {movie.durationFormatted}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                          <div className="space-y-1.5">
                            <h4 className="font-display text-sm font-bold text-white line-clamp-2 leading-snug">
                              {movie.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                              <span>Full Feature · HD</span>
                              {movie.releaseYear && /^\d{4}$/.test(movie.releaseYear) && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {movie.releaseYear}
                                  </span>
                                </>
                              )}
                              {movie.externalGenreLabel && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{movie.externalGenreLabel}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onPlayMovie(movie, [...inAppMatches, ...filteredOutsideFullMovies])
                              }
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Watch Now</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadMovie(movie)}
                              title="Save / Download options"
                              className="p-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleWatchlist(movie.id)}
                              title={inList ? 'Saved in My List' : 'Save to My List'}
                              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                                inList
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                  : 'bg-white/5 hover:bg-white/15 border-white/10 text-slate-300 hover:text-white'
                              }`}
                            >
                              {inList ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {filteredOutsideFullMovies.length > 16 && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAllOutsideFull((prev) => !prev)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0E1118] hover:bg-white/10 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5 text-[#E11D48]" />
                      <span>
                        {showAllOutsideFull
                          ? 'Show Fewer Full Movies'
                          : `Show All ${filteredOutsideFullMovies.length} Full Movies (+${filteredOutsideFullMovies.length - 16} more)`}
                      </span>
                    </button>
                  </div>
                )}
                </div>
              )}

              {filteredOutsideTrailers.length > 0 && (
                <div className={filteredOutsideFullMovies.length > 0 ? 'space-y-3 pt-4 border-t border-white/10' : 'space-y-3'}>
                  {filteredOutsideFullMovies.length > 0 && (
                    <div className="flex items-center justify-between">
                      <h4 className="font-display text-base font-bold text-slate-200">
                        Official Trailers ({filteredOutsideTrailers.length})
                      </h4>
                      <span className="text-xs text-slate-400">
                        More upcoming &amp; theatrical previews
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {filteredOutsideTrailers.map((movie) => {
                      const inList = watchlistIds.has(movie.id);
                      const availMeta = AVAILABILITY_META.TRAILER_AVAILABLE;

                      return (
                        <article
                          key={movie.id}
                          className="group rounded-xl overflow-hidden bg-[#0E1118] border border-white/10 hover:border-white/25 transition-colors flex flex-col"
                        >
                          <div
                            onClick={() =>
                              onPlayMovie(movie, [
                                ...filteredOutsideFullMovies,
                                ...inAppMatches,
                                ...filteredOutsideTrailers,
                              ])
                            }
                            className="relative aspect-video bg-black overflow-hidden cursor-pointer"
                          >
                            <CinemaPosterImage
                              src={movie.thumbnailUrl}
                              fallbackVideoId={movie.youtubeVideoId}
                              alt={movie.title}
                              category={movie.primaryCategory}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-12 h-12 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>
                            <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`font-semibold tracking-wider uppercase ${availMeta.textClass}`}
                              >
                                {availMeta.label}
                              </span>
                              <span className="font-mono tabular-nums text-white/90 bg-black/70 px-1.5 py-0.5 rounded">
                                {movie.durationFormatted}
                              </span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                            <div className="space-y-1.5">
                              <h4 className="font-display text-sm font-bold text-white line-clamp-2 leading-snug">
                                {movie.title}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                <span>Official Trailer · HD</span>
                                {movie.releaseYear && /^\d{4}$/.test(movie.releaseYear) && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">
                                      {movie.releaseYear}
                                    </span>
                                  </>
                                )}
                                {movie.externalGenreLabel && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{movie.externalGenreLabel}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  onPlayMovie(movie, [
                                    ...filteredOutsideFullMovies,
                                    ...inAppMatches,
                                    ...filteredOutsideTrailers,
                                  ])
                                }
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Play Trailer</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDownloadMovie(movie)}
                                title="Save / Download options"
                                className="p-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleWatchlist(movie.id)}
                                title={inList ? 'Saved in My List' : 'Save to My List'}
                                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                                  inList
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                    : 'bg-white/5 hover:bg-white/15 border-white/10 text-slate-300 hover:text-white'
                                }`}
                              >
                                {inList ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Bookmark className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 4. BEST MATCHES / CATEGORY MOVIE CATALOGUE (TMDB VERIFIED MOVIES + PAGINATION) */}
          {catalogItems.length > 0 && outsideResult?.isMovieQuery !== false && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-sky-400">
                    GLOBAL MOVIE CATALOGUE · VERIFIED MOVIES ONLY
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-0.5">
                    {outsideResult?.queryMode === 'plot_description'
                      ? 'Best Plot Matches'
                      : outsideResult?.detectedCategory
                      ? `${outsideResult.detectedCategory.label} — ${
                          SORT_OPTIONS.find((s) => s.id === activeSort)?.label || 'Latest'
                        }`
                      : 'Best Movie Matches'}
                  </h3>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  Showing {catalogItems.length}
                  {totalCatalogResults > catalogItems.length
                    ? ` of ${totalCatalogResults.toLocaleString()}`
                    : ''}{' '}
                  movies
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
                {catalogItems.map((item) => renderCatalogPosterCard(item))}
              </div>

              {/* PAGINATION: LOAD MORE MOVIES */}
              {hasMorePages && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0E1118] hover:bg-white/10 border border-white/15 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                        <span>Loading More Movies...</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 text-[#E11D48]" />
                        <span>Load More Movies (Page {currentPage + 1})</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 5. ORGANIZED CATEGORY SECTIONS: TRENDING & POPULAR MOVIES */}
          {outsideResult?.detectedCategory &&
            outsideResult.sections &&
            outsideResult.isMovieQuery && (
              <div className="space-y-8 pt-2">
                {activeSort !== 'trending' &&
                  outsideResult.sections.trendingMovies.length > 0 && (
                    <section className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-[#E11D48]" />
                          <h3 className="font-display text-lg font-bold text-white">
                            Trending {outsideResult.detectedCategory.label}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSortChange('trending')}
                          className="text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          Sort all by Trending →
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {outsideResult.sections.trendingMovies
                          .slice(0, 4)
                          .map((item) => renderCatalogPosterCard(item))}
                      </div>
                    </section>
                  )}

                {activeSort !== 'popular' &&
                  outsideResult.sections.popularMovies.length > 0 && (
                    <section className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-amber-400" />
                          <h3 className="font-display text-lg font-bold text-white">
                            Popular {outsideResult.detectedCategory.label}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSortChange('popular')}
                          className="text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          Sort all by Most Popular →
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {outsideResult.sections.popularMovies
                          .slice(0, 4)
                          .map((item) => renderCatalogPosterCard(item))}
                      </div>
                    </section>
                  )}
              </div>
            )}

          {/* 6. RELATED MOVIE RECOMMENDATIONS */}
          {relatedSuggestions.length > 0 && outsideResult?.isMovieQuery && (
            <section className="space-y-4 pt-2 border-t border-white/10">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Related Movies You Might Like
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click any title to search its trailers, availability, and full streams.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {relatedSuggestions.slice(0, 8).map((rel) => (
                  <button
                    key={`${rel.title}-${rel.year}`}
                    type="button"
                    onClick={() => handleShortcutClick(rel.title)}
                    className="flex items-start gap-3 p-3 rounded-xl bg-[#0E1118] hover:bg-white/[0.06] border border-white/10 text-left transition-colors cursor-pointer"
                  >
                    {rel.posterUrl ? (
                      <img
                        src={rel.posterUrl}
                        alt={rel.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 rounded-lg object-cover shrink-0 bg-black"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Film className="w-4 h-4 text-slate-500" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="font-display text-sm font-semibold text-white line-clamp-1">
                        {rel.title}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {rel.genre}
                        {rel.year ? ` · ${rel.year}` : ''}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {rel.whySimilar || rel.synopsis}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 7. HELPFUL EMPTY STATE WITH ALTERNATIVE SUGGESTIONS */}
          {hasZeroResults && (
            <div className="rounded-2xl bg-[#0E1118] border border-white/10 p-8 text-center space-y-4">
              <Film className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h3 className="font-display text-lg font-bold text-white">
                  No exact movies found for &ldquo;{query.trim()}&rdquo;
                </h3>
                <p className="text-sm text-slate-400">
                  Try checking the spelling, describing the movie plot in a short sentence,
                  or exploring one of the popular movie categories below.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {(
                  outsideResult?.alternativeSuggestions?.length
                    ? outsideResult.alternativeSuggestions
                    : SUPPORTED_MOVIE_CATEGORIES.slice(0, 6).map((c) => c.label)
                ).map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    onClick={() => handleShortcutClick(alt)}
                    className="px-3.5 py-2 rounded-lg bg-white/5 hover:bg-[#E11D48] border border-white/10 text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    {alt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
CinemaSmartSearch.displayName = 'CinemaSmartSearch';

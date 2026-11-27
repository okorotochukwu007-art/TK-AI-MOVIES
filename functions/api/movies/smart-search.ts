import {
  ExternalCatalogMovieItem,
  MovieCategory,
  MovieItem,
  SearchQueryMode,
  SearchSortOption,
} from '../../../src/types/cinema.ts';
import {
  detectMovieCategoryIntent,
  detectNonMovieQuery,
  extractCanonicalMovieKey,
  findTypoCorrection,
  isPlotDescriptionQuery,
  normalizeSearchText,
  SUPPORTED_MOVIE_CATEGORIES,
} from '../../../src/utils/smartMovieSearch.ts';
import {
  applyLiveReleasePrecedence,
  doesCandidateMatchMovieTitle,
  fetchTmdbPersonFilmography,
  interleaveMultiSourceMovies,
  isNewMoviesDiscoveryQuery,
  isValidExternalMovieCandidate,
  searchDailymotionOutsideApp,
  searchInternetArchiveOutsideApp,
  searchLive2026NewReleases,
  searchTmdbCategoryMovies,
  searchTmdbMetadata,
  searchTmdbMovieCatalog,
  searchVimeoOutsideApp,
  TRAILER_COMPILATION_REGEX,
} from '../../../src/server/multiSourceSearchHelpers.ts';

interface CloudflarePagesContext {
  request: Request;
  env: Record<string, string | undefined>;
}

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

interface ImdbSuggestionItem {
  id: string;
  l: string;
  q?: string;
  qid?: string;
  rank?: number;
  s?: string;
  y?: number;
  i?: {
    imageUrl?: string;
    width?: number;
    height?: number;
  };
}

interface WikiPage {
  pageid: number;
  title: string;
  index?: number;
  extract?: string;
  thumbnail?: {
    source?: string;
  };
}

interface YouTubeCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  durationSeconds: number;
  snippet: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const NON_MOVIE_QUERY_REGEX =
  /\b(recipe|how to cook|cook rice|bake cake|bitcoin|crypto price|forex trading|weather forecast|python tutorial|javascript tutorial|react tutorial|football highlights|premier league table|live score|song lyrics|mp3 download|stock price|symptom|diagnosis)\b/i;

const NON_MOVIE_YOUTUBE_REGEX =
  /(?:\b(?:reaction|reacts to|ending explained|plot explained|story explained|full movie explained|movie explained|explanation|facts and|pitch meeting|honest trailers|review|reveiw|break\s*down|easter eggs|recap|alur cerita|spoil(?:er|s)|summary in \d+|music video|official audio|lyric video|lyrics|remix|unboxing|gameplay|walkthrough|let's play|all cutscenes|full game|movie game|retrospective|evolution of|story so far|latest blockbuster|full reel|part\s*1\s*of\s*2|official hollywood movie|new hollywood movie|watch online in|in hindi download|recreated|recre[eé]|podcast|interviews?|tiktok|full match|highlights|recipe|tutorial|how to|filme completo|pel[ií]cula completa|en espa[nñ]ol|h[öo]rspiel|h[öo]rpiel|concept\s*ai|ai\s*concept|once you start watching this movie)\b|(?:explain|facts)\s*(?:&|\+)|(?:&|\+)\s*facts|[\u0600-\u06FF\u0E00-\u0E7F])/i;

function formatDurationSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function mapExternalGenreToAppCategory(genre: string): MovieCategory {
  const g = genre.toLowerCase();
  if (g.includes('action') || g.includes('adventure') || g.includes('war') || g.includes('crime')) {
    return 'Action Movies';
  }
  if (g.includes('animat') || g.includes('anime') || g.includes('family')) {
    return 'AI Animated Movies';
  }
  if (g.includes('fantasy') || g.includes('sci-fi') || g.includes('science fiction')) {
    return 'Fantasy Romance';
  }
  if (g.includes('romance') || g.includes('love')) {
    return 'Emotional Love Stories';
  }
  return 'New Movies';
}

function inferGenreFromText(text: string): { primary: string; all: string[] } {
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

  if (matched.length === 0) {
    return { primary: 'Feature Film', all: ['Feature Film', 'Global Cinema'] };
  }
  return { primary: matched[0], all: matched.slice(0, 4) };
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit = {}, ms = 4200): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImdbSuggestions(query: string): Promise<ImdbSuggestionItem[]> {
  const normalized = query
    .toLowerCase()
    .replace(/\b(movie|movies|film|films|full|watch)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized || !/[a-z0-9]/.test(normalized[0])) return [];
  const firstChar = normalized[0];
  const url = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(normalized)}.json`;
  const data = await fetchJsonWithTimeout<{ d?: ImdbSuggestionItem[] }>(
    url,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TKStoryworld/1.0)' } },
    3500
  );
  return Array.isArray(data?.d) ? data.d : [];
}

async function fetchWikipediaFilms(query: string): Promise<WikiPage[]> {
  const hasMovieWord = /\b(film|movie|cinema|anime)\b/i.test(query);
  const searchQuery = hasMovieWord ? query : `${query} film`;
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    searchQuery
  )}&gsrlimit=8&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;
  const data = await fetchJsonWithTimeout<{ query?: { pages?: Record<string, WikiPage> } }>(
    url,
    { headers: { 'User-Agent': 'TKStoryworldMovieSearch/1.0' } },
    4000
  );
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  return pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
}

async function analyzeWithGeminiRest(
  apiKey: string,
  query: string
): Promise<any | null> {
  const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
    const body = {
      systemInstruction: {
        parts: [
          {
            text: 'You are a strict, authoritative global cinema librarian. Allow feature movies, drama series, film actors, and film directors across all genres worldwide. Reject non-cinema queries cleanly.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analyze this user search query for a global movie discovery engine: "${query}".
Return JSON with keys:
- isMovieQuery (boolean: true for movie titles, genres, series, film actors/actresses/directors like "Tyler Perry" or "Jason Statham", and movie plots; false ONLY for clearly non-cinema topics like cooking recipes, crypto prices, weather, coding tutorials, sports tables, song lyrics)
- rejectionReason (string)
- isPopularMovie (boolean)
- detectedIntent ("popular_movie" | "genre_or_mood" | "actor_or_director" | "franchise" | "non_movie")
- canonicalTitle (string)
- releaseYear (string, 4-digit year or empty string "", never "N/A")
- primaryGenre (string)
- allGenres (string[])
- directorOrStudio (string)
- castHighlights (string)
- synopsis (string, 2 crisp sentences)
- youtubeSearchQueries (string[], 2 queries targeting embeddable FULL-LENGTH MOVIES first)
- relatedPopularMovies (array of 5 objects with title, year, genre, synopsis, whySimilar, youtubeQuery)`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const json = await fetchJsonWithTimeout<any>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      5500
    );

    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) {
      try {
        return JSON.parse(rawText);
      } catch {
        // try next model
      }
    }
  }
  return null;
}

async function searchYouTubeRawCandidates(
  searchQuery: string,
  minDurationSec: number
): Promise<YouTubeCandidate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const longFilter = minDurationSec >= 1200 ? '&sp=EgIYAg%253D%253D' : '';
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}${longFilter}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    const candidates: YouTubeCandidate[] = [];
    const seen = new Set<string>();

    const walk = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.videoRenderer) {
        const vr = obj.videoRenderer;
        const vid = String(vr.videoId || '');
        if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid) || seen.has(vid)) return;

        const title = vr.title?.runs?.map((r: any) => r.text).join('') || '';
        const chan = vr.ownerText?.runs?.[0]?.text || 'Global Cinema Studio';
        const snippet =
          vr.detailedMetadataSnippets?.[0]?.snippetText?.runs
            ?.map((r: any) => r.text)
            .join('') || '';
        const parts = (vr.lengthText?.simpleText || '').split(':').map(Number);
        const durSec =
          parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts.length === 2
            ? parts[0] * 60 + parts[1]
            : 0;

        if (
          durSec >= minDurationSec &&
          title &&
          !NON_MOVIE_YOUTUBE_REGEX.test(`${title} ${snippet}`) &&
          (durSec >= 600 || !/#shorts\b/i.test(`${title} ${snippet}`)) &&
          (minDurationSec < 600 || !TRAILER_COMPILATION_REGEX.test(`${title} ${snippet}`))
        ) {
          seen.add(vid);
          candidates.push({
            videoId: vid,
            title: title.replace(/\s+/g, ' ').trim(),
            channelTitle: chan,
            channelId:
              vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
            durationSeconds: durSec,
            snippet,
          });
        }
        return;
      }
      if (Array.isArray(obj)) {
        for (const item of obj) walk(item);
      } else {
        for (const k of Object.keys(obj)) walk(obj[k]);
      }
    };

    walk(data);
    return candidates;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyYouTubeOEmbedEdge(videoId: string): Promise<{
  exists: boolean;
  embeddable: boolean;
  title?: string;
  authorName?: string;
}> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;
  const data = await fetchJsonWithTimeout<{ title?: string; author_name?: string }>(
    url,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
    2200
  );
  if (!data) {
    return { exists: false, embeddable: false };
  }
  return {
    exists: true,
    embeddable: true,
    title: data.title,
    authorName: data.author_name,
  };
}

async function executeSmartMovieSearch(
  rawQuery: string,
  existingIds: Set<string>,
  geminiApiKey?: string,
  tmdbApiKey?: string,
  opts: {
    sort?: SearchSortOption;
    page?: number;
    categoryId?: string;
    skipCorrection?: boolean;
  } = {}
): Promise<SmartMovieSearchResponse> {
  const query = rawQuery.trim();
  const page = Math.max(1, Math.min(20, Math.floor(opts.page || 1)));
  if (!query || query.length < 2) {
    return {
      query,
      effectiveQuery: query,
      correctedQuery: null,
      queryMode: 'exact_title',
      detectedCategory: null,
      sort: opts.sort || 'latest',
      page: 1,
      totalPages: 0,
      totalResults: 0,
      hasMore: false,
      isMovieQuery: true,
      rejectionReason: null,
      recognizedMovie: null,
      outsideMovies: [],
      catalogMovies: [],
      relatedSuggestions: [],
      sourcesSearched: ['TMDB Movies', 'YouTube', 'Dailymotion', 'Vimeo', 'Internet Archive'],
    };
  }

  const nonMovieCheck = detectNonMovieQuery(query);
  if (NON_MOVIE_QUERY_REGEX.test(query) || nonMovieCheck.isNonMovie) {
    return {
      query,
      effectiveQuery: query,
      correctedQuery: null,
      queryMode: 'non_movie',
      detectedCategory: null,
      sort: opts.sort || 'latest',
      page: 1,
      totalPages: 0,
      totalResults: 0,
      hasMore: false,
      isMovieQuery: false,
      rejectionReason:
        nonMovieCheck.reason ||
        'Strict Movie Search Only — TK STORYWORLD discovers strictly movies across all genres worldwide.',
      recognizedMovie: {
        canonicalTitle: query,
        releaseYear: '',
        primaryGenre: 'Movies Only',
        allGenres: [],
        directorOrStudio: '',
        castHighlights: '',
        synopsis: '',
        isPopularMovie: false,
        detectedIntent: 'non_movie',
      },
      outsideMovies: [],
      catalogMovies: [],
      relatedSuggestions: [],
      alternativeSuggestions: ['Horror Movies', 'Action Movies', 'Nollywood Movies', 'Latest 2026 Movies'],
    };
  }

  const explicitCat = opts.categoryId
    ? SUPPORTED_MOVIE_CATEGORIES.find((c) => c.id === opts.categoryId) || null
    : null;
  const catDetection = detectMovieCategoryIntent(query);
  const detectedCat = explicitCat || catDetection.category;
  const resolvedSort: SearchSortOption =
    opts.sort || (detectedCat ? catDetection.preferredSort : 'latest');
  const localTypo = !opts.skipCorrection ? findTypoCorrection(query) : null;
  const effectiveTerm =
    !opts.skipCorrection && localTypo?.kind === 'movie_title' ? localTypo.corrected : query;

  if (page > 1) {
    const paged = detectedCat
      ? await searchTmdbCategoryMovies({
          category: detectedCat,
          sort: resolvedSort,
          page,
          yearHint: catDetection.yearHint,
          apiKey: tmdbApiKey,
        })
      : await searchTmdbMovieCatalog({
          query: effectiveTerm,
          sort: resolvedSort,
          page,
          apiKey: tmdbApiKey,
        });
    return {
      query,
      effectiveQuery: effectiveTerm,
      correctedQuery: localTypo?.corrected || null,
      queryMode: detectedCat ? 'category' : localTypo ? 'typo_or_partial' : 'exact_title',
      detectedCategory: detectedCat ? { id: detectedCat.id, label: detectedCat.label } : null,
      sort: resolvedSort,
      page: paged.page,
      totalPages: paged.totalPages,
      totalResults: paged.totalResults,
      hasMore: paged.hasMore,
      isMovieQuery: true,
      rejectionReason: null,
      recognizedMovie: null,
      outsideMovies: [],
      catalogMovies: paged.items,
      relatedSuggestions: [],
      sourcesSearched: ['TMDB Movies'],
    };
  }

  if (detectedCat) {
    const [primaryPage, trendingPage, popularPage, ytCatFulls, dmCat, vimeoCat, archiveCat, live2026] = await Promise.all([
      searchTmdbCategoryMovies({
        category: detectedCat,
        sort: resolvedSort,
        page: 1,
        yearHint: catDetection.yearHint,
        apiKey: tmdbApiKey,
      }),
      resolvedSort === 'trending'
        ? Promise.resolve(null)
        : searchTmdbCategoryMovies({
            category: detectedCat,
            sort: 'trending',
            page: 1,
            yearHint: catDetection.yearHint,
            apiKey: tmdbApiKey,
          }),
      resolvedSort === 'popular'
        ? Promise.resolve(null)
        : searchTmdbCategoryMovies({
            category: detectedCat,
            sort: 'popular',
            page: 1,
            yearHint: catDetection.yearHint,
            apiKey: tmdbApiKey,
          }),
      searchYouTubeRawCandidates(detectedCat.youtubeQuery, 1500),
      searchDailymotionOutsideApp({
        query: detectedCat.dailymotionQuery,
        primaryTitle: detectedCat.label,
        existingIds,
        genreLabel: detectedCat.label,
        releaseYear: catDetection.yearHint || '2026',
        isGenreQuery: true,
        category: detectedCat,
        maxResults: 10,
      }),
      searchVimeoOutsideApp({
        query: detectedCat.label,
        primaryTitle: detectedCat.label,
        existingIds,
        genreLabel: detectedCat.label,
        isGenreQuery: true,
        category: detectedCat,
        maxResults: 5,
      }),
      searchInternetArchiveOutsideApp({
        query: detectedCat.label,
        primaryTitle: detectedCat.label,
        existingIds,
        genreLabel: detectedCat.label,
        releaseYear: catDetection.yearHint || '',
        isGenreQuery: true,
        category: detectedCat,
        maxResults: 8,
      }),
      searchLive2026NewReleases({
        query: detectedCat.label,
        existingIds,
        tmdbApiKey,
        category: detectedCat,
        maxResults: 6,
      }),
    ]);

    const seenCatYt = new Set<string>();
    const validYtCat = [...ytCatFulls]
      .sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0))
      .filter((c) => {
        if (seenCatYt.has(c.videoId) || existingIds.has(c.videoId)) return false;
        const ok = isValidExternalMovieCandidate({
          candidateTitle: c.title,
          candidateSnippet: c.snippet,
          channelTitle: c.channelTitle,
          query: detectedCat.label,
          primaryTitle: detectedCat.label,
          targetReleaseYear: catDetection.yearHint || '',
          isNewQuery: Boolean(detectedCat.isTrendingOrLatest),
          isGenreQuery: true,
          durationSeconds: c.durationSeconds,
          category: detectedCat,
          releaseKind: 'full_movie',
        });
        if (!ok) return false;
        seenCatYt.add(c.videoId);
        return true;
      })
      .slice(0, 14);

    const verifiedYtCat = (
      await Promise.all(
        validYtCat.map(async (c) => {
          const oembed = await verifyYouTubeOEmbedEdge(c.videoId);
          if (!oembed.exists || !oembed.embeddable) return null;
          const cleanTitle = c.title
            .replace(/^\[FULL\]\s*/i, '')
            .replace(/#[a-zA-Z0-9_]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const detectedYrMatch = `${cleanTitle} ${c.snippet}`.match(/\b(202[0-7]|201\d)\b/);
          const extractedYear = detectedYrMatch?.[1] || (catDetection.yearHint || '');
          const item: OutsideAppMovieResult = {
            id: `ext-${c.videoId}`,
            youtubeVideoId: c.videoId,
            sourcePlatform: 'youtube',
            externalVideoId: c.videoId,
            title: cleanTitle || oembed.title || detectedCat.label,
            synopsis:
              c.snippet && c.snippet.length > 35
                ? c.snippet.slice(0, 260)
                : `Playable ${detectedCat.label} stream discovered outside TK STORYWORLD.`,
            thumbnailUrl: `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`,
            backdropUrl: `https://i.ytimg.com/vi/${c.videoId}/maxresdefault.jpg`,
            primaryCategory: mapExternalGenreToAppCategory(detectedCat.label),
            secondaryCategories: ['New Movies'],
            channelTitle: c.channelTitle || oembed.authorName || 'Global Cinema',
            channelId: c.channelId,
            publishedAt: extractedYear ? `${extractedYear}-01-15T00:00:00.000Z` : new Date().toISOString(),
            durationSeconds: c.durationSeconds,
            durationFormatted: formatDurationSeconds(c.durationSeconds),
            viewCount: 1850000,
            likeCount: 112000,
            commentsCount: 12400,
            hookTag: 'Full Movie · HD',
            isEmbeddable: true,
            playbackStatus: 'active',
            approvalStatus: 'approved',
            isFeatured: false,
            seriesId: null,
            seasonNumber: null,
            episodeNumber: null,
            discoveredVia: 'youtube_api',
            aiQualityScore: 93,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            releaseKind: 'full_movie',
            externalGenreLabel: detectedCat.label,
            releaseYear: extractedYear || '2026',
            sourcePlatformLabel: 'Full Feature · HD',
          };
          return item;
        })
      )
    ).filter((item): item is OutsideAppMovieResult => item !== null);

    return {
      query,
      effectiveQuery: detectedCat.label,
      correctedQuery: catDetection.wasTypoCorrected ? detectedCat.label : null,
      queryMode: detectedCat.isTrendingOrLatest ? 'trending_or_latest' : 'category',
      detectedCategory: { id: detectedCat.id, label: detectedCat.label },
      sort: resolvedSort,
      page: primaryPage.page,
      totalPages: primaryPage.totalPages,
      totalResults: primaryPage.totalResults,
      hasMore: primaryPage.hasMore,
      isMovieQuery: true,
      rejectionReason: null,
      recognizedMovie: null,
      outsideMovies: interleaveMultiSourceMovies([verifiedYtCat, dmCat, archiveCat, live2026, vimeoCat], 30),
      catalogMovies: primaryPage.items,
      sections: {
        bestMatches: primaryPage.items.slice(0, 8),
        latestMovies: resolvedSort === 'latest' ? primaryPage.items.slice(0, 8) : [],
        trendingMovies:
          resolvedSort === 'trending'
            ? primaryPage.items.slice(0, 8)
            : trendingPage?.items.slice(0, 8) || [],
        popularMovies:
          resolvedSort === 'popular'
            ? primaryPage.items.slice(0, 8)
            : popularPage?.items.slice(0, 8) || [],
      },
      relatedSuggestions: [],
      sourcesSearched: ['TMDB Movies', 'YouTube', 'Dailymotion', 'Vimeo', 'Internet Archive'],
    };
  }

  const [aiData, tmdbData, tmdbCatalog, imdbItems, wikiPages] = await Promise.all([
    geminiApiKey ? analyzeWithGeminiRest(geminiApiKey, query) : Promise.resolve(null),
    searchTmdbMetadata(effectiveTerm, tmdbApiKey),
    searchTmdbMovieCatalog({
      query: effectiveTerm,
      sort: resolvedSort,
      page: 1,
      apiKey: tmdbApiKey,
    }),
    fetchImdbSuggestions(effectiveTerm),
    fetchWikipediaFilms(effectiveTerm),
  ]);

  if (aiData && aiData.isMovieQuery === false) {
    return {
      query,
      isMovieQuery: false,
      rejectionReason:
        aiData.rejectionReason ||
        'TK STORYWORLD Search is strictly for movies across all genres. Try a movie title, actor, or genre.',
      recognizedMovie: {
        canonicalTitle: query,
        releaseYear: '',
        primaryGenre: 'Not a Movie Query',
        allGenres: [],
        directorOrStudio: '',
        castHighlights: '',
        synopsis: '',
        isPopularMovie: false,
        detectedIntent: 'non_movie',
      },
      outsideMovies: [],
      relatedSuggestions: [],
    };
  }

  const imdbMovies = imdbItems.filter(
    (item) =>
      item.l &&
      (item.qid === 'movie' ||
        item.q === 'feature' ||
        item.qid === 'tvMovie' ||
        (item.id && item.id.startsWith('tt') && item.qid !== 'tvSeries' && item.qid !== 'videoGame'))
  );

  const filmWikiPages = wikiPages.filter((p) => {
    const titleLower = (p.title || '').toLowerCase();
    const extLower = (p.extract || '').toLowerCase();
    if (titleLower.includes('(soundtrack)') || titleLower.includes('(disambiguation)')) {
      return false;
    }
    return /\b(film|movie|cinema|animated|thriller|drama|comedy|horror|sci-fi|nollywood|bollywood|anime|directed by|starring)\b/.test(
      `${titleLower} ${extLower}`
    );
  });

  const topImdb = imdbMovies[0];
  const topWiki = filmWikiPages[0] || wikiPages[0];
  const wikiSynopsis = topWiki?.extract || '';
  const wikiYearMatch = wikiSynopsis.match(/\b(19\d{2}|20[0-2]\d)\b/);
  const inferredGenres = inferGenreFromText(
    `${query} ${wikiSynopsis} ${aiData?.primaryGenre || ''}`
  );

  const isNewQuery = isNewMoviesDiscoveryQuery(query);
  const rawRecognizedMovie: RecognizedPopularMovie | null = aiData
    ? {
        canonicalTitle:
          aiData.canonicalTitle ||
          tmdbData?.topMatch?.title ||
          topImdb?.l ||
          topWiki?.title?.replace(/\s*\([^)]*film[^)]*\)/i, '') ||
          query,
        releaseYear:
          aiData.releaseYear ||
          tmdbData?.topMatch?.releaseYear ||
          (topImdb?.y ? String(topImdb.y) : wikiYearMatch?.[1] || (isNewQuery ? '2026' : '')),
        primaryGenre:
          aiData.primaryGenre || tmdbData?.topMatch?.genres?.[0] || inferredGenres.primary,
        allGenres:
          Array.isArray(aiData.allGenres) && aiData.allGenres.length > 0
            ? aiData.allGenres
            : tmdbData?.topMatch?.genres?.length
            ? tmdbData.topMatch.genres
            : inferredGenres.all,
        directorOrStudio: aiData.directorOrStudio || '',
        castHighlights: aiData.castHighlights || topImdb?.s || '',
        synopsis: aiData.synopsis || tmdbData?.topMatch?.overview || wikiSynopsis || '',
        posterUrl: tmdbData?.topMatch?.posterUrl || topImdb?.i?.imageUrl || topWiki?.thumbnail?.source,
        isPopularMovie: Boolean(
          aiData.isPopularMovie || tmdbData?.topMatch || (topImdb?.rank && topImdb.rank < 150000)
        ),
        watchProviders:
          tmdbData?.topMatch?.watchProviders || [
            {
              name: 'JustWatch',
              url: `https://www.justwatch.com/us/search?q=${encodeURIComponent(
                tmdbData?.topMatch?.title || aiData.canonicalTitle || query
              )}`,
            },
            {
              name: 'Tubi (Free)',
              url: `https://tubitv.com/search/${encodeURIComponent(
                tmdbData?.topMatch?.title || aiData.canonicalTitle || query
              )}`,
            },
            {
              name: 'IMDb',
              url: `https://www.imdb.com/find/?q=${encodeURIComponent(
                tmdbData?.topMatch?.title || aiData.canonicalTitle || query
              )}&s=tt`,
            },
          ],
        licensingNotice: null,
        detectedIntent: aiData.detectedIntent || 'popular_movie',
      }
    : tmdbData?.topMatch || topImdb || (topWiki && !/^list\s+of\s+/i.test(topWiki.title))
    ? {
        canonicalTitle:
          tmdbData?.topMatch?.title ||
          topImdb?.l ||
          (topWiki?.title && !/^list\s+of\s+/i.test(topWiki.title)
            ? topWiki.title.replace(/\s*\([^)]*film[^)]*\)/i, '')
            : query),
        releaseYear:
          tmdbData?.topMatch?.releaseYear ||
          (topImdb?.y ? String(topImdb.y) : wikiYearMatch?.[1] || (isNewQuery ? '2026' : '')),
        primaryGenre: tmdbData?.topMatch?.genres?.[0] || inferredGenres.primary,
        allGenres: tmdbData?.topMatch?.genres?.length
          ? tmdbData.topMatch.genres
          : inferredGenres.all,
        directorOrStudio: '',
        castHighlights: topImdb?.s || '',
        synopsis:
          tmdbData?.topMatch?.overview ||
          wikiSynopsis ||
          `Recognized movie matching "${query}"${topImdb?.s ? ` starring ${topImdb.s}` : ''}.`,
        posterUrl: tmdbData?.topMatch?.posterUrl || topImdb?.i?.imageUrl || topWiki?.thumbnail?.source,
        isPopularMovie:
          Boolean(tmdbData?.topMatch) ||
          Boolean(topImdb && (!topImdb.rank || topImdb.rank < 200000)) ||
          filmWikiPages.length > 0,
        watchProviders:
          tmdbData?.topMatch?.watchProviders || [
            {
              name: 'JustWatch',
              url: `https://www.justwatch.com/us/search?q=${encodeURIComponent(
                tmdbData?.topMatch?.title || topImdb?.l || query
              )}`,
            },
            {
              name: 'Tubi (Free)',
              url: `https://tubitv.com/search/${encodeURIComponent(
                tmdbData?.topMatch?.title || topImdb?.l || query
              )}`,
            },
            {
              name: 'IMDb',
              url: `https://www.imdb.com/find/?q=${encodeURIComponent(
                tmdbData?.topMatch?.title || topImdb?.l || query
              )}&s=tt`,
            },
          ],
        licensingNotice: null,
        detectedIntent: isNewQuery ? 'genre_or_mood' : topImdb ? 'popular_movie' : 'genre_or_mood',
      }
    : isNewQuery
    ? {
        canonicalTitle: 'New 2026 Global & Nollywood Releases',
        releaseYear: '2026',
        primaryGenre: 'New Releases',
        allGenres: ['2026 Premieres', 'Free Full Movies', 'Nollywood 2026', 'Action'],
        directorOrStudio: 'YouTube · Dailymotion · Vimeo · TMDB 2026',
        castHighlights: '',
        synopsis:
          'Streaming free legal 2026 full-length Nollywood & indie releases alongside official 2026 studio trailers and licensed platform links.',
        isPopularMovie: false,
        watchProviders: [],
        licensingNotice: null,
        detectedIntent: 'genre_or_mood',
      }
    : null;

  const recognizedMovie: RecognizedPopularMovie | null = rawRecognizedMovie
    ? applyLiveReleasePrecedence({
        recognizedMovie: rawRecognizedMovie,
        query,
        isNewQuery,
        tmdbTop: tmdbData?.topMatch,
        imdbTop: topImdb,
      })
    : null;

  const primaryTitle = recognizedMovie?.canonicalTitle || query;
  const targetReleaseYear = recognizedMovie?.releaseYear || '';
  const genreLabel = recognizedMovie?.primaryGenre || 'Global Cinema';
  const isGenreQuery =
    !isNewQuery && recognizedMovie?.detectedIntent === 'genre_or_mood';

  const geminiOverriddenByLiveDb = Boolean(
    aiData &&
      recognizedMovie &&
      (recognizedMovie.canonicalTitle !== aiData.canonicalTitle ||
        recognizedMovie.releaseYear !== aiData.releaseYear)
  );

  const cleanReleaseYear = /^\d{4}$/.test(targetReleaseYear.trim())
    ? targetReleaseYear.trim()
    : '';
  const isActorOrDirectorQuery =
    recognizedMovie?.detectedIntent === 'actor_or_director' ||
    recognizedMovie?.detectedIntent === 'franchise' ||
    (!isNewQuery &&
      /\b(movies|films)\s*$/i.test(query) &&
      (!tmdbData?.topMatch ||
        !doesCandidateMatchMovieTitle(query, primaryTitle, tmdbData.topMatch.title, false)));

  const tmdbPersonFilmography = isActorOrDirectorQuery
    ? await fetchTmdbPersonFilmography(primaryTitle || query, tmdbApiKey)
    : [];

  const knownTitles = Array.from(
    new Set(
      [
        ...tmdbPersonFilmography,
        ...(Array.isArray(aiData?.relatedPopularMovies) ? aiData.relatedPopularMovies.map((r: any) => r?.title) : []),
        ...tmdbCatalog.items.slice(0, 12).map((m) => m.title),
        ...imdbMovies.slice(0, 8).map((m) => m.l),
        ...filmWikiPages
          .slice(0, 6)
          .map((p) => p.title.replace(/\s*\([^)]*film[^)]*\)/i, '').trim())
          .filter((t) => !/^list\s+of\s+/i.test(t)),
        ...(tmdbData?.related || []).map((r) => r.title),
      ]
        .map((t) => String(t || '').trim())
        .filter((t) => t.length >= 3 && t.toLowerCase() !== primaryTitle.toLowerCase())
    )
  ).slice(0, 50);

  const searchQueries = isNewQuery
    ? /\b(nollywood|nigerian|nigeria|yoruba|african)\b/i.test(query)
      ? [
          '2026 latest nigerian nollywood full movie',
          'nollywood 2026 full movie ruth kadiri',
          'latest nigerian full movie 2025 2026',
        ]
      : [
          '2026 latest nigerian nollywood full movie',
          '2026 full movie english free action drama',
          '2025 2026 full movie hd english',
        ]
    : isActorOrDirectorQuery
    ? Array.from(
        new Set(
          [
            `${primaryTitle} full movie`,
            `${primaryTitle} full movie english`,
            ...(!geminiOverriddenByLiveDb && Array.isArray(aiData?.youtubeSearchQueries)
              ? aiData.youtubeSearchQueries.filter((sq: unknown) => typeof sq === 'string' && !/\btrailer\b/i.test(sq))
              : []),
            `${primaryTitle} best full movies`,
            `${primaryTitle} full stage play movie`,
          ].filter((s) => typeof s === 'string' && s.trim().length >= 3)
        )
      ).slice(0, 4)
    : Array.from(
        new Set(
          [
            `${primaryTitle} ${cleanReleaseYear} full movie`.trim(),
            `${primaryTitle} full movie english`.trim(),
            ...(!geminiOverriddenByLiveDb && Array.isArray(aiData?.youtubeSearchQueries)
              ? aiData.youtubeSearchQueries.filter((sq: unknown) => typeof sq === 'string' && !/\btrailer\b/i.test(sq))
              : []),
            `${primaryTitle} full movie`,
          ].filter((s) => typeof s === 'string' && s.trim().length >= 3)
        )
      ).slice(0, 3);

  // Run ALL sources in parallel: YouTube Full (>20 min) + YouTube Official Trailers (fallback) + Dailymotion + Vimeo + Internet Archive + Live 2026 Drops
  const shouldFetchTrailers = !isNewQuery && !isGenreQuery;
  const isCommercialStudioRelease =
    !isActorOrDirectorQuery &&
    Boolean(tmdbData?.topMatch?.isCommercialStudioRelease);
  const [
    fullBatches,
    rawTrailerCandidates,
    dailymotionMovies,
    vimeoMovies,
    archiveMovies,
    live2026Drops,
  ] = await Promise.all([
    isCommercialStudioRelease
      ? Promise.resolve([] as YouTubeCandidate[][])
      : Promise.all(searchQueries.map((sq) => searchYouTubeRawCandidates(sq, 1500))),
    shouldFetchTrailers
      ? searchYouTubeRawCandidates(
          `${primaryTitle} ${cleanReleaseYear || '2026'} official trailer`.trim(),
          45
        )
      : Promise.resolve([] as YouTubeCandidate[]),
    searchDailymotionOutsideApp({
      query,
      primaryTitle,
      existingIds,
      genreLabel,
      releaseYear: cleanReleaseYear,
      isGenreQuery,
      isActorOrDirectorQuery,
      knownTitles,
      isCommercialStudioRelease,
      maxResults: 10,
    }),
    searchVimeoOutsideApp({
      query,
      primaryTitle,
      existingIds,
      genreLabel,
      isGenreQuery,
      maxResults: 5,
    }),
    searchInternetArchiveOutsideApp({
      query,
      primaryTitle,
      existingIds,
      genreLabel,
      releaseYear: cleanReleaseYear,
      isGenreQuery,
      isActorOrDirectorQuery,
      knownTitles,
      isCommercialStudioRelease,
      maxResults: 8,
    }),
    searchLive2026NewReleases({
      query,
      existingIds,
      tmdbApiKey,
      maxResults: 6,
    }),
  ]);

  const validFullCandidates = fullBatches.flat().filter((c) =>
    isValidExternalMovieCandidate({
      candidateTitle: c.title,
      candidateSnippet: c.snippet,
      channelTitle: c.channelTitle,
      query,
      primaryTitle,
      targetReleaseYear,
      isNewQuery,
      isGenreQuery,
      isActorOrDirectorQuery,
      knownTitles,
      durationSeconds: c.durationSeconds,
      fromTargetedActorSearch: isActorOrDirectorQuery,
      isCommercialStudioRelease,
      releaseKind: 'full_movie',
    })
  );

  const tmdbTrailerKey = tmdbData?.topMatch?.officialTrailerKey;
  const mergedTrailerPool: YouTubeCandidate[] = [
    ...(tmdbTrailerKey && /^[A-Za-z0-9_-]{11}$/.test(tmdbTrailerKey)
      ? [
          {
            videoId: tmdbTrailerKey,
            title: `${primaryTitle} (${targetReleaseYear || '2026'}) — Official Trailer`,
            channelTitle: 'Official Studio Channel',
            channelId: '',
            durationSeconds: 150,
            snippet:
              recognizedMovie?.synopsis ||
              `Official trailer for ${primaryTitle} verified via TMDB.`,
          },
        ]
      : []),
    ...rawTrailerCandidates.filter(
      (c) =>
        c.durationSeconds >= 45 &&
        c.durationSeconds <= 420 &&
        isValidExternalMovieCandidate({
          candidateTitle: c.title,
          candidateSnippet: c.snippet,
          channelTitle: c.channelTitle,
          query,
          primaryTitle,
          targetReleaseYear,
          isNewQuery,
          isGenreQuery,
          isActorOrDirectorQuery,
          knownTitles,
          durationSeconds: c.durationSeconds,
          releaseKind: 'official_trailer',
        })
    ),
  ];

  const deduped: Array<YouTubeCandidate & { releaseKind: 'full_movie' | 'official_trailer' }> = [];
  const seenIds = new Set<string>();
  const seenCanon = new Set<string>();
  const sortedFullCandidates = [...validFullCandidates].sort(
    (a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0)
  );
  for (const c of sortedFullCandidates) {
    if (seenIds.has(c.videoId) || existingIds.has(c.videoId)) continue;
    const canon = extractCanonicalMovieKey(c.title);
    if (canon && seenCanon.has(canon)) continue;
    seenIds.add(c.videoId);
    if (canon) seenCanon.add(canon);
    deduped.push({ ...c, releaseKind: 'full_movie' });
    if (deduped.length >= 20) break;
  }
  const hasFullElsewhere =
    deduped.length > 0 ||
    dailymotionMovies.some((m) => m.releaseKind === 'full_movie') ||
    archiveMovies.length > 0 ||
    vimeoMovies.length > 0;
  const trailerLimit = hasFullElsewhere ? 2 : 5;
  let addedTrailers = 0;
  for (const c of mergedTrailerPool) {
    if (addedTrailers >= trailerLimit) break;
    if (!seenIds.has(c.videoId) && !existingIds.has(c.videoId)) {
      seenIds.add(c.videoId);
      deduped.push({ ...c, releaseKind: 'official_trailer' });
      addedTrailers += 1;
    }
  }

  const verifiedList = await Promise.all(
    deduped.slice(0, 22).map(async (c) => {
      const oembed = await verifyYouTubeOEmbedEdge(c.videoId);
      if (!oembed.exists || !oembed.embeddable) return null;
      const mappedCategory = mapExternalGenreToAppCategory(genreLabel);
      const cleanTitle = c.title
        .replace(/^\[FULL\]\s*/i, '')
        .replace(/#[a-zA-Z0-9_]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const item: OutsideAppMovieResult = {
        id: `ext-${c.videoId}`,
        youtubeVideoId: c.videoId,
        sourcePlatform: 'youtube',
        externalVideoId: c.videoId,
        title: cleanTitle || oembed.title || primaryTitle,
        synopsis:
          c.snippet && c.snippet.length > 35
            ? c.snippet.slice(0, 260)
            : recognizedMovie?.synopsis ||
              `Discovered outside the app for "${query}". Stream full-screen inside TK STORYWORLD.`,
        thumbnailUrl: `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`,
        backdropUrl: `https://i.ytimg.com/vi/${c.videoId}/maxresdefault.jpg`,
        primaryCategory: mappedCategory,
        secondaryCategories: ['New Movies'],
        channelTitle: c.channelTitle || oembed.authorName || 'Global Cinema',
        channelId: c.channelId,
        publishedAt: new Date().toISOString(),
        durationSeconds: c.durationSeconds,
        durationFormatted: formatDurationSeconds(c.durationSeconds),
        viewCount: c.releaseKind === 'full_movie' ? 4800000 : 1200000,
        likeCount: c.releaseKind === 'full_movie' ? 260000 : 65000,
        commentsCount: 18500,
        hookTag:
          c.releaseKind === 'full_movie'
            ? 'YouTube · Full Movie'
            : 'YouTube · Official Trailer',
        isEmbeddable: true,
        playbackStatus: 'active',
        approvalStatus: 'approved',
        isFeatured: false,
        seriesId: null,
        seasonNumber: null,
        episodeNumber: null,
        discoveredVia: 'youtube_api',
        aiQualityScore: 95,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        releaseKind: c.releaseKind,
        externalGenreLabel: genreLabel,
        releaseYear: recognizedMovie?.releaseYear || '',
        sourcePlatformLabel:
          c.releaseKind === 'full_movie'
            ? 'YouTube · Full Feature'
            : 'YouTube · Official Trailer',
      };
      return item;
    })
  );

  const youtubeOutsideMovies = verifiedList.filter(
    (item): item is OutsideAppMovieResult => item !== null
  );

  const outsideMovies = interleaveMultiSourceMovies(
    [youtubeOutsideMovies, dailymotionMovies, archiveMovies, live2026Drops, vimeoMovies],
    32
  );

  const hasAnyFullMovieMatch = outsideMovies.some((m) => m.releaseKind === 'full_movie');
  if (recognizedMovie && !isNewQuery && !hasAnyFullMovieMatch) {
    recognizedMovie.licensingNotice =
      'New commercial & studio movies are copyright-protected, so YouTube, Dailymotion, Vimeo & Internet Archive only allow the Official Trailer. Watch the trailer here or stream the full film via official platforms below.';
  }

  const relatedMap = new Map<string, SmartMovieSuggestion>();
  for (const rel of aiData?.relatedPopularMovies || []) {
    const key = String(rel.title || '').toLowerCase().trim();
    if (!key) continue;
    const matchedImdb = imdbMovies.find((m) => m.l.toLowerCase().includes(key));
    relatedMap.set(key, {
      title: rel.title,
      year: rel.year || '',
      genre: rel.genre || 'Feature Film',
      synopsis: rel.synopsis || '',
      whySimilar: rel.whySimilar || '',
      youtubeQuery: rel.youtubeQuery || `${rel.title} full movie`,
      posterUrl: matchedImdb?.i?.imageUrl,
    });
  }

  for (const m of imdbMovies.slice(0, 6)) {
    const title = m.l?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (key === primaryTitle.toLowerCase().trim() || relatedMap.has(key)) continue;
    relatedMap.set(key, {
      title,
      year: m.y ? String(m.y) : '',
      genre: recognizedMovie?.primaryGenre || 'Feature Film',
      synopsis: m.s ? `Starring ${m.s}.` : `Popular global movie matching "${query}".`,
      whySimilar: `Matches "${query}" across global cinema`,
      youtubeQuery: `${title} ${m.y || ''} full movie`.trim(),
      posterUrl: m.i?.imageUrl,
    });
  }

  for (const p of filmWikiPages.slice(0, 6)) {
    const cleanWikiTitle = p.title.replace(/\s*\([^)]*film[^)]*\)/i, '').trim();
    const key = cleanWikiTitle.toLowerCase();
    if (!cleanWikiTitle || key === primaryTitle.toLowerCase().trim() || relatedMap.has(key)) {
      continue;
    }
    const yr = p.extract?.match(/\b(19\d{2}|20[0-2]\d)\b/)?.[1] || '';
    relatedMap.set(key, {
      title: cleanWikiTitle,
      year: yr,
      genre: inferGenreFromText(p.extract || '').primary,
      synopsis: (p.extract || '').slice(0, 180),
      whySimilar: `Related film matching "${query}"`,
      youtubeQuery: `${cleanWikiTitle} ${yr} full movie`.trim(),
      posterUrl: p.thumbnail?.source,
    });
  }

  for (const rel of tmdbData?.related || []) {
    const key = rel.title.toLowerCase().trim();
    if (!key || key === primaryTitle.toLowerCase().trim() || relatedMap.has(key)) continue;
    relatedMap.set(key, rel);
  }

  return {
    query,
    effectiveQuery: effectiveTerm,
    correctedQuery: localTypo?.corrected || null,
    queryMode: isPlotDescriptionQuery(query)
      ? 'plot_description'
      : localTypo
      ? 'typo_or_partial'
      : 'exact_title',
    detectedCategory: null,
    sort: resolvedSort,
    page: tmdbCatalog.page,
    totalPages: tmdbCatalog.totalPages,
    totalResults: tmdbCatalog.totalResults,
    hasMore: tmdbCatalog.hasMore,
    isMovieQuery: true,
    rejectionReason: null,
    recognizedMovie,
    outsideMovies,
    catalogMovies: tmdbCatalog.items,
    sections: {
      bestMatches: tmdbCatalog.items.slice(0, 8),
      latestMovies: [...tmdbCatalog.items]
        .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
        .slice(0, 8),
      trendingMovies: [...tmdbCatalog.items]
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 8),
      popularMovies: [...tmdbCatalog.items]
        .sort((a, b) => b.voteCount - a.voteCount)
        .slice(0, 8),
    },
    relatedSuggestions: Array.from(relatedMap.values()).slice(0, 8),
    sourcesSearched: ['TMDB Movies', 'YouTube', 'Dailymotion', 'Vimeo', 'Internet Archive'],
  };
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const parseSortParam = (raw: unknown): SearchSortOption | undefined => {
  const s = String(raw || '').toLowerCase();
  return s === 'latest' || s === 'trending' || s === 'popular' || s === 'top_rated'
    ? s
    : undefined;
};

function hydrateProcessEnv(env: Record<string, string | undefined>) {
  if (!env) return;
  if (env.TMDB_API_KEY) process.env.TMDB_API_KEY = env.TMDB_API_KEY;
  if (env.YOUTUBE_API_KEY) process.env.YOUTUBE_API_KEY = env.YOUTUBE_API_KEY;
  if (env.SUPABASE_URL) process.env.SUPABASE_URL = env.SUPABASE_URL;
  if (env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  if (env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
}

export async function onRequestGet(context: CloudflarePagesContext): Promise<Response> {
  try {
    hydrateProcessEnv(context.env);
    const url = new URL(context.request.url);
    const query = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    const result = await executeSmartMovieSearch(
      query,
      new Set<string>(),
      context.env?.GEMINI_API_KEY,
      context.env?.TMDB_API_KEY || context.env?.VITE_TMDB_API_KEY,
      {
        sort: parseSortParam(url.searchParams.get('sort')),
        page: Number(url.searchParams.get('page')) || 1,
        categoryId: url.searchParams.get('categoryId') || undefined,
        skipCorrection: url.searchParams.get('skipCorrection') === 'true',
      }
    );
    return new Response(JSON.stringify(result), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Smart movie search failed.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestPost(context: CloudflarePagesContext): Promise<Response> {
  try {
    hydrateProcessEnv(context.env);
    const body = (await context.request.json().catch(() => ({}))) as {
      query?: string;
      existingVideoIds?: string[];
      sort?: SearchSortOption;
      page?: number;
      categoryId?: string;
      skipCorrection?: boolean;
    };
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const existingIds = new Set<string>(
      Array.isArray(body.existingVideoIds) ? body.existingVideoIds : []
    );
    const result = await executeSmartMovieSearch(
      query,
      existingIds,
      context.env?.GEMINI_API_KEY,
      context.env?.TMDB_API_KEY || context.env?.VITE_TMDB_API_KEY,
      {
        sort: parseSortParam(body.sort),
        page: Number(body.page) || 1,
        categoryId: body.categoryId,
        skipCorrection: Boolean(body.skipCorrection),
      }
    );
    return new Response(JSON.stringify(result), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Smart movie search failed.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ExternalCatalogMovieItem,
  MovieCategory,
  MovieItem,
  SearchQueryMode,
  SearchSortOption,
  SearchSuggestionItem,
} from '../types/cinema.ts';
import {
  buildLocalSearchSuggestions,
  detectMovieCategoryIntent,
  detectNonMovieQuery,
  extractCanonicalMovieKey,
  findTypoCorrection,
  isClickbaitOrReviewVideo,
  isPlotDescriptionQuery,
  normalizeSearchText,
  SUPPORTED_MOVIE_CATEGORIES,
} from '../utils/smartMovieSearch.ts';
import { formatDurationSeconds, verifyYouTubeOEmbed } from './youtubeDiscovery.ts';
import {
  applyLiveReleasePrecedence,
  doesCandidateMatchMovieTitle,
  fetchTmdbPersonFilmography,
  interleaveMultiSourceMovies,
  isNewMoviesDiscoveryQuery,
  isValidExternalMovieCandidate,
  resolveTmdbMovieTrailer,
  searchDailymotionOutsideApp,
  searchInternetArchiveOutsideApp,
  searchLive2026NewReleases,
  searchTmdbCategoryMovies,
  searchTmdbMetadata,
  searchTmdbMovieCatalog,
  searchTmdbMoviesByPlotKeywords,
  searchTmdbMovieSuggestions,
  searchVimeoOutsideApp,
  TRAILER_COMPILATION_REGEX,
  verifyMovieTitlesOnTmdb,
} from './multiSourceSearchHelpers.ts';

export interface SmartMovieSuggestion {
  title: string;
  year: string;
  genre: string;
  synopsis: string;
  whySimilar: string;
  youtubeQuery: string;
  posterUrl?: string;
}

export interface RecognizedPopularMovie {
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

export interface OutsideAppMovieResult extends MovieItem {
  releaseKind: 'full_movie' | 'official_trailer';
  externalGenreLabel: string;
  releaseYear: string;
  sourcePlatformLabel: string;
}

export interface SmartMovieSearchResponse {
  query: string;
  effectiveQuery?: string;
  correctedQuery?: string | null;
  queryMode: SearchQueryMode;
  detectedCategory?: { id: string; label: string } | null;
  sort: SearchSortOption;
  page: number;
  totalPages: number;
  totalResults: number;
  hasMore: boolean;
  isMovieQuery: boolean;
  rejectionReason: string | null;
  recognizedMovie: RecognizedPopularMovie | null;
  outsideMovies: OutsideAppMovieResult[];
  catalogMovies: ExternalCatalogMovieItem[];
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

interface GeminiMovieAnalysis {
  isMovieQuery: boolean;
  rejectionReason: string;
  isPopularMovie: boolean;
  isPlotDescription?: boolean;
  correctedTitle?: string;
  detectedIntent:
    | 'popular_movie'
    | 'genre_or_mood'
    | 'actor_or_director'
    | 'franchise'
    | 'plot_description'
    | 'non_movie';
  canonicalTitle: string;
  releaseYear: string;
  primaryGenre: string;
  allGenres: string[];
  directorOrStudio: string;
  castHighlights: string;
  synopsis: string;
  youtubeSearchQueries: string[];
  plotMatchedMovies?: Array<{
    title: string;
    year: string;
    whyMatched: string;
  }>;
  relatedPopularMovies: Array<{
    title: string;
    year: string;
    genre: string;
    synopsis: string;
    whySimilar: string;
    youtubeQuery: string;
  }>;
}

interface SearchCacheEntry {
  expiresAt: number;
  response: SmartMovieSearchResponse;
}

const SMART_SEARCH_CACHE = new Map<string, SearchCacheEntry>();
const MAX_SMART_SEARCH_CACHE = 120;

function getCachedSearchResponse(key: string): SmartMovieSearchResponse | null {
  const hit = SMART_SEARCH_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    SMART_SEARCH_CACHE.delete(key);
    return null;
  }
  return hit.response;
}

function setCachedSearchResponse(
  key: string,
  response: SmartMovieSearchResponse,
  ttlMs = 5 * 60 * 1000
): void {
  if (SMART_SEARCH_CACHE.size >= MAX_SMART_SEARCH_CACHE) {
    const oldest = SMART_SEARCH_CACHE.keys().next().value;
    if (oldest) SMART_SEARCH_CACHE.delete(oldest);
  }
  SMART_SEARCH_CACHE.set(key, { expiresAt: Date.now() + ttlMs, response });
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const NON_MOVIE_YOUTUBE_REGEX =
  /(?:\b(?:reaction|reacts to|ending explained|plot explained|story explained|full movie explained|movie explained|explanation|facts and|pitch meeting|honest trailers|review|reveiw|break\s*down|easter eggs|recap|alur cerita|spoil(?:er|s)|summary in \d+|music video|official audio|lyric video|lyrics|remix|unboxing|gameplay|walkthrough|let's play|all cutscenes|full game|movie game|retrospective|evolution of|story so far|latest blockbuster|full reel|part\s*1\s*of\s*2|official hollywood movie|new hollywood movie|watch online in|in hindi download|recreated|recre[eé]|podcast|interviews?|tiktok|full match|highlights|recipe|tutorial|how to|filme completo|pel[ií]cula completa|en espa[nñ]ol|h[öo]rspiel|h[öo]rpiel|concept\s*ai|ai\s*concept|once you start watching this movie)\b|(?:explain|facts)\s*(?:&|\+)|(?:&|\+)\s*facts|[\u0600-\u06FF\u0E00-\u0E7F])/i;

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

async function callGeminiMovieModel(
  ai: GoogleGenAI,
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
  query: string,
  timeoutMs = 7000
): Promise<GeminiMovieAnalysis> {
  const genPromise = ai.models.generateContent({
    model,
    contents: `Analyze this user search query for a global Movies & Series discovery engine: "${query}"

Your strict rules:
1. MOVIES & SERIES ONLY: Determine if the user is searching for a FEATURE MOVIE, MOVIES, a MOVIE/DRAMA SERIES, or a FILM ACTOR / ACTRESS / DIRECTOR / FILMMAKER (any global cinema: Hollywood, Nollywood/Nigerian, Bollywood, Korean/K-Drama, African, Anime, Sci-Fi, Action, Horror, Thriller, Crime, Romance, Comedy, Drama, Documentary, Family, Historical, Fantasy, 2024-2026 movies and 2026 series).
   - Set isMovieQuery = true if the query refers to a movie or series title (even misspelled like "Avngers", "Spidarman", "Fast and furius", or partial), a movie actor/actress/director/filmmaker (e.g. "Tyler Perry", "Jason Statham", "Ruth Kadiri", "Denzel Washington"), a movie franchise, a movie/series genre/category (e.g. "2026 series", "nollywood series", "horror movies"), or a plot description.
   - Set isMovieQuery = false ONLY if the user is searching for clearly NON-CINEMA items: music, songs, albums, singers, podcasts, news, recipes, tutorials, sports matches, crypto/stocks, or unrelated websites. Explain briefly in rejectionReason that TK STORYWORLD searches exclusively for movies and series.
2. TYPO CORRECTION: If the user misspelled a movie title (e.g. "Avngers" -> "Avengers", "Spidarman" -> "Spider-Man", "Fast and furius" -> "Fast & Furious"), put the exact corrected movie title in correctedTitle and canonicalTitle. Otherwise set correctedTitle to empty string "".
3. PLOT DESCRIPTION MATCHING: If the user is describing a movie plot or storyline rather than giving a title, set isPlotDescription = true, detectedIntent = "plot_description", and populate plotMatchedMovies with 5-6 REAL released movies (never invented titles) that genuinely match that plot, ranked most relevant first, with exact title, release year, and a concise 1-sentence whyMatched explanation. Put the #1 best-matching real film in canonicalTitle, releaseYear, primaryGenre, synopsis.
4. Detect Popular Movie Intent:
   - Set isPopularMovie = true if the user is searching for a specific recognized film, actor/director filmography, or iconic movie franchise.
   - Set detectedIntent to one of: "popular_movie", "genre_or_mood", "actor_or_director", "franchise", "plot_description", or "non_movie".
5. Extract clean details for canonicalTitle, releaseYear (4-digit year or empty string "", NEVER "N/A"), primaryGenre, allGenres (up to 4 genres), directorOrStudio, castHighlights, and a crisp 2-sentence cinema synopsis.
6. Generate 2 tailored youtubeSearchQueries designed STRICTLY to find embeddable FULL-LENGTH MOVIES on YouTube (always prioritize full movies over trailers; never songs, reviews, interviews, or reaction videos).
7. Recommend 5 relatedPopularMovies (REAL released movies matching the taste/genre/actor/director of the search).`,
    config: {
      systemInstruction:
        'You are a strict, authoritative global cinema search engine. Allow feature movies, drama series, film actors, and film directors across all global cinema traditions. Never invent fake movie titles. Reject music, podcasts, recipes, sports, and non-cinema queries cleanly.',
      thinkingConfig: {
        thinkingLevel:
          model === 'gemini-4-hydrogen'
            ? ThinkingLevel.LOW
            : ThinkingLevel.MINIMAL,
      },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isMovieQuery: { type: Type.BOOLEAN },
          rejectionReason: { type: Type.STRING },
          isPopularMovie: { type: Type.BOOLEAN },
          isPlotDescription: { type: Type.BOOLEAN },
          correctedTitle: { type: Type.STRING },
          detectedIntent: { type: Type.STRING },
          canonicalTitle: { type: Type.STRING },
          releaseYear: { type: Type.STRING },
          primaryGenre: { type: Type.STRING },
          allGenres: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          directorOrStudio: { type: Type.STRING },
          castHighlights: { type: Type.STRING },
          synopsis: { type: Type.STRING },
          youtubeSearchQueries: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          plotMatchedMovies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                year: { type: Type.STRING },
                whyMatched: { type: Type.STRING },
              },
              required: ['title', 'year', 'whyMatched'],
            },
          },
          relatedPopularMovies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                year: { type: Type.STRING },
                genre: { type: Type.STRING },
                synopsis: { type: Type.STRING },
                whySimilar: { type: Type.STRING },
                youtubeQuery: { type: Type.STRING },
              },
              required: [
                'title',
                'year',
                'genre',
                'synopsis',
                'whySimilar',
                'youtubeQuery',
              ],
            },
          },
        },
        required: [
          'isMovieQuery',
          'rejectionReason',
          'isPopularMovie',
          'isPlotDescription',
          'correctedTitle',
          'detectedIntent',
          'canonicalTitle',
          'releaseYear',
          'primaryGenre',
          'allGenres',
          'directorOrStudio',
          'castHighlights',
          'synopsis',
          'youtubeSearchQueries',
          'plotMatchedMovies',
          'relatedPopularMovies',
        ],
      },
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('503 Gemini timeout')), timeoutMs)
  );
  const response = await Promise.race([genPromise, timeoutPromise]);

  return JSON.parse((response.text ?? '{}').trim()) as GeminiMovieAnalysis;
}

function formatReadableGeminiError(err: any): string {
  const raw = String(err?.message || 'Movie intelligence request failed.');
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      return String(parsed.error.message);
    }
  } catch {
    // not JSON
  }
  return raw;
}

async function analyzeQueryWithGemini(
  query: string,
  isPlotHint = false
): Promise<{ ok: true; data: GeminiMovieAnalysis } | { ok: false; error: string }> {
  const ai = getGenAIClient();
  if (!ai) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY is not configured on the server.',
    };
  }

  let lastErr: any = null;
  const attempts: Array<{
    model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
    delayMs: number;
    timeoutMs: number;
  }> = [
    { model: 'gemini-3.1-flash-lite', delayMs: 0, timeoutMs: isPlotHint ? 7000 : 5500 },
    { model: 'gemini-4-hydrogen', delayMs: 150, timeoutMs: isPlotHint ? 9000 : 7500 },
  ];

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((r) => setTimeout(r, attempt.delayMs));
    }
    try {
      const data = await callGeminiMovieModel(ai, attempt.model, query, attempt.timeoutMs);
      return { ok: true, data };
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      const isTransient =
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('timeout');
      if (!isTransient) {
        break;
      }
    }
  }

  return {
    ok: false,
    error: formatReadableGeminiError(lastErr),
  };
}

interface ItunesMovieRecord {
  trackName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artistName?: string;
  longDescription?: string;
  shortDescription?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
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
  };
}

interface WikiFilmPage {
  pageid: number;
  title: string;
  index?: number;
  extract?: string;
  thumbnail?: {
    source?: string;
  };
}

async function fetchImdbMovieSuggestions(term: string): Promise<ImdbSuggestionItem[]> {
  try {
    const normalized = term
      .toLowerCase()
      .replace(/\b(movie|movies|film|films|full|watch)\b/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!normalized || !/[a-z0-9]/.test(normalized[0])) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://v3.sg.media-imdb.com/suggestion/${normalized[0]}/${encodeURIComponent(
      normalized
    )}.json`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TKStoryworld/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const json = (await res.json()) as { d?: ImdbSuggestionItem[] };
    const list = Array.isArray(json.d) ? json.d : [];
    return list.filter(
      (item) =>
        item.l &&
        (item.qid === 'movie' ||
          item.q === 'feature' ||
          item.qid === 'tvMovie' ||
          (item.id?.startsWith('tt') && item.qid !== 'tvSeries' && item.qid !== 'videoGame'))
    );
  } catch {
    return [];
  }
}

async function fetchWikipediaFilmPages(term: string): Promise<WikiFilmPage[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const hasFilmWord = /\b(film|movie|cinema|anime)\b/i.test(term);
    const searchQuery = hasFilmWord ? term : `${term} film`;
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      searchQuery
    )}&gsrlimit=8&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TKStoryworldMovieSearch/1.0' },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      query?: { pages?: Record<string, WikiFilmPage> };
    };
    const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
    return pages
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .filter((p) => {
        const tl = (p.title || '').toLowerCase();
        const el = (p.extract || '').toLowerCase();
        if (tl.includes('(soundtrack)') || tl.includes('(disambiguation)')) return false;
        return /\b(film|movie|cinema|animated|thriller|drama|comedy|horror|sci-fi|nollywood|bollywood|anime|directed by|starring)\b/.test(
          `${tl} ${el}`
        );
      });
  } catch {
    return [];
  }
}

async function fetchItunesMovieMetadata(term: string): Promise<ItunesMovieRecord[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      term
    )}&media=movie&entity=movie&limit=8&country=US`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TKStoryworldMovieSearch/1.0' },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: ItunesMovieRecord[] };
    return Array.isArray(json.results) ? json.results : [];
  } catch {
    return [];
  }
}

interface YouTubeCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  durationSeconds: number;
  snippet: string;
}

async function searchYouTubeRawCandidates(
  searchQuery: string,
  minDurationSec: number
): Promise<YouTubeCandidate[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    // Append YouTube's official >20 minutes filter (&sp=EgIYAg%253D%253D) when hunting full-length movies
    // so YouTube returns ~20 genuine full movies instead of 2-minute trailers & clips!
    const longFilter = minDurationSec >= 1200 ? '&sp=EgIYAg%253D%253D' : '';
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      searchQuery
    )}${longFilter}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
      },
    });
    clearTimeout(timeout);
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
        if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid) || seen.has(vid)) {
          return;
        }
        const title =
          vr.title?.runs?.map((r: any) => r.text).join('') || '';
        const chan =
          vr.ownerText?.runs?.[0]?.text || 'Global Cinema Studio';
        const snippet =
          vr.detailedMetadataSnippets?.[0]?.snippetText?.runs
            ?.map((r: any) => r.text)
            .join('') || '';
        const parts = (vr.lengthText?.simpleText || '')
          .split(':')
          .map(Number);
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
          !isClickbaitOrReviewVideo(title, snippet) &&
          (minDurationSec < 600 || !TRAILER_COMPILATION_REGEX.test(`${title} ${snippet}`))
        ) {
          seen.add(vid);
          candidates.push({
            videoId: vid,
            title: title.replace(/\s+/g, ' ').trim(),
            channelTitle: chan,
            channelId:
              vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
                ?.browseId || '',
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
  }
}

export interface SmartMovieSearchOptions {
  sort?: SearchSortOption;
  page?: number;
  categoryId?: string;
  skipCorrection?: boolean;
  existingMovies?: MovieItem[];
}

export async function searchMoviesOutsideApp(
  rawQuery: string,
  existingVideoIds: Set<string> = new Set(),
  options: SmartMovieSearchOptions = {}
): Promise<SmartMovieSearchResponse> {
  const query = rawQuery.trim();
  const requestedPage = Math.max(1, Math.min(20, Math.floor(options.page || 1)));
  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '';

  const inAppMovies = options.existingMovies || [];
  const inAppTitleLookup = new Map<string, string>();
  for (const m of inAppMovies) {
    if (m.approvalStatus === 'approved' && m.playbackStatus === 'active') {
      const norm = normalizeSearchText(m.title);
      if (norm && !inAppTitleLookup.has(norm)) {
        inAppTitleLookup.set(norm, m.id);
      }
    }
  }

  if (!query || query.length < 2) {
    return {
      query,
      effectiveQuery: query,
      correctedQuery: null,
      queryMode: 'exact_title',
      detectedCategory: null,
      sort: options.sort || 'latest',
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
      alternativeSuggestions: [],
    };
  }

  // 1. STRICT MOVIES-ONLY GATE (instant rejection of music, songs, TV shows, podcasts, news, recipes, etc.)
  const nonMovieCheck = detectNonMovieQuery(query);
  if (nonMovieCheck.isNonMovie) {
    return {
      query,
      effectiveQuery: query,
      correctedQuery: null,
      queryMode: 'non_movie',
      detectedCategory: null,
      sort: options.sort || 'latest',
      page: 1,
      totalPages: 0,
      totalResults: 0,
      hasMore: false,
      isMovieQuery: false,
      rejectionReason:
        nonMovieCheck.reason ||
        'TK STORYWORLD Search is exclusively for movies. Try a movie title, genre, or plot description.',
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
      alternativeSuggestions: [
        'Horror Movies',
        'Action Movies',
        'Nollywood Movies',
        'Latest 2026 Movies',
      ],
    };
  }

  // 2. DETECT CATEGORY INTENT, TYPO CORRECTION, AND PLOT DESCRIPTION INTENT
  const explicitCat = options.categoryId
    ? SUPPORTED_MOVIE_CATEGORIES.find((c) => c.id === options.categoryId) || null
    : null;
  const catDetection = detectMovieCategoryIntent(query);
  const detectedCat = explicitCat || catDetection.category;

  const localTypo = !options.skipCorrection
    ? findTypoCorrection(
        query,
        inAppMovies.slice(0, 250).map((m) => m.title)
      )
    : null;

  const resolvedSort: SearchSortOption =
    options.sort || (detectedCat ? catDetection.preferredSort : 'latest');

  const isPlotLocal = !detectedCat && isPlotDescriptionQuery(query);
  const effectiveSearchTerm =
    !options.skipCorrection && localTypo && localTypo.kind === 'movie_title'
      ? localTypo.corrected
      : query;

  // Check TTL cache before making external API calls
  const cacheKey = `${normalizeSearchText(query)}|${detectedCat?.id || 'none'}|${resolvedSort}|p${requestedPage}|skip:${Boolean(options.skipCorrection)}`;
  const cachedResponse = getCachedSearchResponse(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 3. FAST PAGINATION PATH (page > 1 loads next TMDB movie page immediately without re-running Gemini/YouTube)
  if (requestedPage > 1) {
    const pageResult = detectedCat
      ? await searchTmdbCategoryMovies({
          category: detectedCat,
          sort: resolvedSort,
          page: requestedPage,
          yearHint: catDetection.yearHint,
          apiKey: tmdbApiKey,
          inAppLookup: inAppTitleLookup,
        })
      : await searchTmdbMovieCatalog({
          query: effectiveSearchTerm,
          sort: resolvedSort,
          page: requestedPage,
          apiKey: tmdbApiKey,
          inAppLookup: inAppTitleLookup,
        });

    const pagedResp: SmartMovieSearchResponse = {
      query,
      effectiveQuery: effectiveSearchTerm,
      correctedQuery: localTypo ? localTypo.corrected : null,
      queryMode: detectedCat
        ? detectedCat.isTrendingOrLatest
          ? 'trending_or_latest'
          : 'category'
        : localTypo
        ? 'typo_or_partial'
        : 'exact_title',
      detectedCategory: detectedCat
        ? { id: detectedCat.id, label: detectedCat.label }
        : null,
      sort: resolvedSort,
      page: pageResult.page,
      totalPages: pageResult.totalPages,
      totalResults: pageResult.totalResults,
      hasMore: pageResult.hasMore,
      isMovieQuery: true,
      rejectionReason: null,
      recognizedMovie: null,
      outsideMovies: [],
      catalogMovies: pageResult.items,
      relatedSuggestions: [],
      sourcesSearched: ['TMDB Movies'],
    };
    setCachedSearchResponse(cacheKey, pagedResp, 8 * 60 * 1000);
    return pagedResp;
  }

  // 4. INTELLIGENT CATEGORY-BASED SEARCH (Horror, Action, Romance, Nollywood, Bollywood, Hollywood, etc.)
  if (detectedCat) {
    const [
      primaryPage,
      trendingPage,
      popularPage,
      ytCatFullsPrimary,
      ytCatFullsSecondary,
      dmCatMovies,
      vimeoCatMovies,
      archiveCatMovies,
      live2026Drops,
    ] = await Promise.all([
      searchTmdbCategoryMovies({
        category: detectedCat,
        sort: resolvedSort,
        page: 1,
        yearHint: catDetection.yearHint,
        apiKey: tmdbApiKey,
        inAppLookup: inAppTitleLookup,
      }),
      resolvedSort === 'trending'
        ? Promise.resolve(null)
        : searchTmdbCategoryMovies({
            category: detectedCat,
            sort: 'trending',
            page: 1,
            yearHint: catDetection.yearHint,
            apiKey: tmdbApiKey,
            inAppLookup: inAppTitleLookup,
          }),
      resolvedSort === 'popular'
        ? Promise.resolve(null)
        : searchTmdbCategoryMovies({
            category: detectedCat,
            sort: 'popular',
            page: 1,
            yearHint: catDetection.yearHint,
            apiKey: tmdbApiKey,
            inAppLookup: inAppTitleLookup,
          }),
      searchYouTubeRawCandidates(detectedCat.youtubeQuery, 1500),
      searchYouTubeRawCandidates(`${detectedCat.label} full movie hd`, 1500),
      searchDailymotionOutsideApp({
        query: detectedCat.dailymotionQuery,
        primaryTitle: detectedCat.label,
        existingIds: existingVideoIds,
        genreLabel: detectedCat.label,
        releaseYear: catDetection.yearHint || '2026',
        isGenreQuery: true,
        category: detectedCat,
        maxResults: 10,
      }),
      searchVimeoOutsideApp({
        query: detectedCat.label,
        primaryTitle: detectedCat.label,
        existingIds: existingVideoIds,
        genreLabel: detectedCat.label,
        isGenreQuery: true,
        category: detectedCat,
        maxResults: 5,
      }),
      searchInternetArchiveOutsideApp({
        query: detectedCat.label,
        primaryTitle: detectedCat.label,
        existingIds: existingVideoIds,
        genreLabel: detectedCat.label,
        releaseYear: catDetection.yearHint || '',
        isGenreQuery: true,
        category: detectedCat,
        maxResults: 8,
      }),
      searchLive2026NewReleases({
        query: detectedCat.id === 'nollywood' || detectedCat.id === 'african' ? 'nollywood 2026' : detectedCat.label,
        existingIds: existingVideoIds,
        tmdbApiKey,
        category: detectedCat,
        maxResults: 6,
      }),
    ]);

    const seenCatYt = new Set<string>();
    const seenCatCanon = new Set<string>();
    const validYtCandidates = [...ytCatFullsPrimary, ...ytCatFullsSecondary]
      .sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0))
      .filter((c) => {
        if (seenCatYt.has(c.videoId) || existingVideoIds.has(c.videoId)) return false;
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
        const canon = extractCanonicalMovieKey(c.title);
        if (canon && seenCatCanon.has(canon)) return false;
        seenCatYt.add(c.videoId);
        if (canon) seenCatCanon.add(canon);
        return true;
      })
      .slice(0, 18);

    const verifiedYt = (
      await Promise.all(
        validYtCandidates.map(async (c) => {
          if (existingVideoIds.has(c.videoId)) return null;
          const oembed = await Promise.race([
            verifyYouTubeOEmbed(c.videoId),
            new Promise<{ exists: boolean; embeddable: boolean; title?: string; authorName?: string }>(
              (resolve) => setTimeout(() => resolve({ exists: false, embeddable: false }), 2200)
            ),
          ]);
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

    const outsideMovies = interleaveMultiSourceMovies(
      [verifiedYt, dmCatMovies, archiveCatMovies, live2026Drops, vimeoCatMovies],
      30
    );

    const primaryTmdbIds = new Set(primaryPage.items.map((x) => x.tmdbId));
    const latestItems = resolvedSort === 'latest' ? primaryPage.items : [];
    const trendingItems =
      resolvedSort === 'trending'
        ? primaryPage.items
        : (trendingPage?.items || []).filter((x) => !primaryTmdbIds.has(x.tmdbId)).slice(0, 8);
    const popularItems =
      resolvedSort === 'popular'
        ? primaryPage.items
        : (popularPage?.items || [])
            .filter(
              (x) =>
                !primaryTmdbIds.has(x.tmdbId) &&
                !trendingItems.some((t) => t.tmdbId === x.tmdbId)
            )
            .slice(0, 8);

    const categoryResponse: SmartMovieSearchResponse = {
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
      outsideMovies,
      catalogMovies: primaryPage.items,
      sections: {
        bestMatches: primaryPage.items.slice(0, 8),
        latestMovies: latestItems.slice(0, 8),
        trendingMovies: trendingItems,
        popularMovies: popularItems,
      },
      relatedSuggestions: [],
      alternativeSuggestions: SUPPORTED_MOVIE_CATEGORIES.filter(
        (c) => c.id !== detectedCat.id && !c.isTrendingOrLatest
      )
        .slice(0, 5)
        .map((c) => c.label),
      sourcesSearched: ['TMDB Movies', 'YouTube', 'Dailymotion', 'Vimeo', 'Internet Archive'],
      intelligenceNotice: null,
    };

    setCachedSearchResponse(cacheKey, categoryResponse, 8 * 60 * 1000);
    return categoryResponse;
  }

  // 5. TITLE, TYPO/PARTIAL, AND PLOT-DESCRIPTION INTELLIGENT SEARCH
  // Run Gemini strict movie intelligence + TMDB + TMDB Movie Catalog + TMDB Plot Keyword Search + IMDb + Wikipedia + Apple iTunes in parallel
  const [
    geminiResult,
    initialTmdbData,
    tmdbCatalogInitial,
    plotKeywordFallbackMovies,
    imdbRecords,
    wikiPages,
    itunesRecords,
  ] = await Promise.all([
    analyzeQueryWithGemini(query, isPlotLocal),
    !isPlotLocal ? searchTmdbMetadata(effectiveSearchTerm, tmdbApiKey) : Promise.resolve(null),
    !isPlotLocal
      ? searchTmdbMovieCatalog({
          query: effectiveSearchTerm,
          sort: resolvedSort,
          page: 1,
          apiKey: tmdbApiKey,
          inAppLookup: inAppTitleLookup,
        })
      : Promise.resolve({
          items: [] as ExternalCatalogMovieItem[],
          page: 1,
          totalPages: 0,
          totalResults: 0,
          hasMore: false,
        }),
    isPlotLocal
      ? searchTmdbMoviesByPlotKeywords({
          plotQuery: query,
          apiKey: tmdbApiKey,
          inAppLookup: inAppTitleLookup,
        })
      : Promise.resolve([] as ExternalCatalogMovieItem[]),
    !isPlotLocal ? fetchImdbMovieSuggestions(effectiveSearchTerm) : Promise.resolve([]),
    !isPlotLocal ? fetchWikipediaFilmPages(effectiveSearchTerm) : Promise.resolve([]),
    !isPlotLocal ? fetchItunesMovieMetadata(effectiveSearchTerm) : Promise.resolve([]),
  ]);

  let tmdbData = initialTmdbData;
  const aiData = geminiResult.ok ? geminiResult.data : null;

  // Enforce strict movie-only gate when Gemini detects a non-movie query
  if (aiData && !aiData.isMovieQuery) {
    return {
      query,
      effectiveQuery: query,
      correctedQuery: null,
      queryMode: 'non_movie',
      detectedCategory: null,
      sort: resolvedSort,
      page: 1,
      totalPages: 0,
      totalResults: 0,
      hasMore: false,
      isMovieQuery: false,
      rejectionReason:
        aiData.rejectionReason ||
        'TK STORYWORLD Search is strictly for movies across all genres. Try a movie title, genre, or plot description.',
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
      alternativeSuggestions: [
        'Horror Movies',
        'Action Movies',
        'Nollywood Movies',
        'Trending Movies',
      ],
    };
  }

  // Determine final typo correction & plot-description verification
  const isPlotQuery = Boolean(isPlotLocal || aiData?.isPlotDescription || aiData?.detectedIntent === 'plot_description');
  const aiCorrectedTitle =
    !options.skipCorrection &&
    !isPlotQuery &&
    aiData?.correctedTitle &&
    normalizeSearchText(aiData.correctedTitle) !== normalizeSearchText(query)
      ? aiData.correctedTitle.trim()
      : null;

  const finalCorrectedQuery =
    !options.skipCorrection && !isPlotQuery
      ? (localTypo?.kind === 'movie_title' ? localTypo.corrected : null) || aiCorrectedTitle
      : null;

  let catalogResult = tmdbCatalogInitial;

  if (isPlotQuery) {
    const verifiedPlotMovies =
      Array.isArray(aiData?.plotMatchedMovies) && aiData.plotMatchedMovies.length > 0
        ? await verifyMovieTitlesOnTmdb({
            candidates: aiData.plotMatchedMovies.map((m) => ({
              title: m.title,
              year: m.year,
              reason: m.whyMatched,
            })),
            apiKey: tmdbApiKey,
            inAppLookup: inAppTitleLookup,
          })
        : [];

    let fallbackPool = plotKeywordFallbackMovies;
    if (fallbackPool.length === 0 && verifiedPlotMovies.length < 4) {
      fallbackPool = await searchTmdbMoviesByPlotKeywords({
        plotQuery: query,
        apiKey: tmdbApiKey,
        inAppLookup: inAppTitleLookup,
      });
    }

    const mergedPlotMovies: ExternalCatalogMovieItem[] = [];
    const seenPlotIds = new Set<number>();
    for (const item of [...verifiedPlotMovies, ...fallbackPool]) {
      if (!seenPlotIds.has(item.tmdbId)) {
        seenPlotIds.add(item.tmdbId);
        mergedPlotMovies.push(item);
      }
    }

    catalogResult = {
      items: mergedPlotMovies.slice(0, 14),
      page: 1,
      totalPages: 1,
      totalResults: mergedPlotMovies.length,
      hasMore: false,
    };
    if (!tmdbData && mergedPlotMovies[0]) {
      tmdbData = await searchTmdbMetadata(mergedPlotMovies[0].title, tmdbApiKey);
    }
  } else if (
    finalCorrectedQuery &&
    normalizeSearchText(finalCorrectedQuery) !== normalizeSearchText(effectiveSearchTerm)
  ) {
    const [correctedMeta, correctedCatalog] = await Promise.all([
      searchTmdbMetadata(finalCorrectedQuery, tmdbApiKey),
      searchTmdbMovieCatalog({
        query: finalCorrectedQuery,
        sort: resolvedSort,
        page: 1,
        apiKey: tmdbApiKey,
        inAppLookup: inAppTitleLookup,
      }),
    ]);
    if (correctedMeta) tmdbData = correctedMeta;
    if (correctedCatalog.items.length > 0) catalogResult = correctedCatalog;
  } else if (catalogResult.items.length === 0 && aiData?.canonicalTitle && !isPlotQuery) {
    const fallbackCatalog = await searchTmdbMovieCatalog({
      query: aiData.canonicalTitle,
      sort: resolvedSort,
      page: 1,
      apiKey: tmdbApiKey,
      inAppLookup: inAppTitleLookup,
    });
    if (fallbackCatalog.items.length > 0) catalogResult = fallbackCatalog;
  }

  // Build Recognized Popular Movie card (enriching Gemini with IMDb, Wikipedia & iTunes artwork/runtime)
  const topImdbMatch = imdbRecords[0];
  const topWikiMatch = wikiPages[0];
  const topItunesMatch = itunesRecords.find(
    (rec) =>
      rec.trackName &&
      aiData?.canonicalTitle &&
      (rec.trackName.toLowerCase().includes(aiData.canonicalTitle.toLowerCase()) ||
        aiData.canonicalTitle.toLowerCase().includes(rec.trackName.toLowerCase()))
  ) || itunesRecords[0];

  const hiResPoster =
    tmdbData?.topMatch?.posterUrl ||
    topImdbMatch?.i?.imageUrl ||
    (topItunesMatch?.artworkUrl100
      ? topItunesMatch.artworkUrl100.replace('100x100bb', '600x600bb')
      : undefined) ||
    topWikiMatch?.thumbnail?.source;

  const wikiYearMatch = (topWikiMatch?.extract || '').match(/\b(19\d{2}|20[0-2]\d)\b/);
  const isNewQuery = isNewMoviesDiscoveryQuery(query);

  const rawRecognizedMovie: RecognizedPopularMovie | null = aiData
    ? {
        canonicalTitle:
          aiData.canonicalTitle ||
          tmdbData?.topMatch?.title ||
          topImdbMatch?.l ||
          topItunesMatch?.trackName ||
          topWikiMatch?.title?.replace(/\s*\([^)]*film[^)]*\)/i, '') ||
          query,
        releaseYear:
          aiData.releaseYear ||
          tmdbData?.topMatch?.releaseYear ||
          (topImdbMatch?.y ? String(topImdbMatch.y) : '') ||
          (topItunesMatch?.releaseDate ? topItunesMatch.releaseDate.slice(0, 4) : '') ||
          wikiYearMatch?.[1] ||
          (isNewQuery ? '2026' : ''),
        primaryGenre:
          aiData.primaryGenre ||
          tmdbData?.topMatch?.genres?.[0] ||
          topItunesMatch?.primaryGenreName ||
          'Feature Film',
        allGenres:
          Array.isArray(aiData.allGenres) && aiData.allGenres.length > 0
            ? aiData.allGenres
            : tmdbData?.topMatch?.genres?.length
            ? tmdbData.topMatch.genres
            : [topItunesMatch?.primaryGenreName || 'Cinema'],
        directorOrStudio:
          aiData.directorOrStudio || topItunesMatch?.artistName || '',
        castHighlights: aiData.castHighlights || topImdbMatch?.s || '',
        synopsis:
          aiData.synopsis ||
          tmdbData?.topMatch?.overview ||
          topWikiMatch?.extract ||
          topItunesMatch?.longDescription ||
          topItunesMatch?.shortDescription ||
          '',
        posterUrl: hiResPoster,
        runtimeLabel: topItunesMatch?.trackTimeMillis
          ? formatDurationSeconds(Math.round(topItunesMatch.trackTimeMillis / 1000))
          : undefined,
        isPopularMovie: Boolean(
          aiData.isPopularMovie ||
            tmdbData?.topMatch ||
            (topImdbMatch?.rank && topImdbMatch.rank < 200000)
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
        detectedIntent:
          (aiData.detectedIntent as RecognizedPopularMovie['detectedIntent']) ||
          (aiData.isPopularMovie ? 'popular_movie' : 'genre_or_mood'),
      }
    : tmdbData?.topMatch ||
      topImdbMatch ||
      topItunesMatch ||
      (topWikiMatch && !/^list\s+of\s+/i.test(topWikiMatch.title))
    ? {
        canonicalTitle:
          tmdbData?.topMatch?.title ||
          topImdbMatch?.l ||
          topItunesMatch?.trackName ||
          (topWikiMatch?.title && !/^list\s+of\s+/i.test(topWikiMatch.title)
            ? topWikiMatch.title.replace(/\s*\([^)]*film[^)]*\)/i, '')
            : query) ||
          query,
        releaseYear:
          tmdbData?.topMatch?.releaseYear ||
          (topImdbMatch?.y ? String(topImdbMatch.y) : '') ||
          topItunesMatch?.releaseDate?.slice(0, 4) ||
          wikiYearMatch?.[1] ||
          (isNewQuery ? '2026' : ''),
        primaryGenre:
          tmdbData?.topMatch?.genres?.[0] ||
          topItunesMatch?.primaryGenreName ||
          'Feature Film',
        allGenres: tmdbData?.topMatch?.genres?.length
          ? tmdbData.topMatch.genres
          : [topItunesMatch?.primaryGenreName || 'Cinema'],
        directorOrStudio: topItunesMatch?.artistName || '',
        castHighlights: topImdbMatch?.s || '',
        synopsis:
          tmdbData?.topMatch?.overview ||
          topWikiMatch?.extract ||
          topItunesMatch?.longDescription ||
          topItunesMatch?.shortDescription ||
          `Popular movie matching "${query}".`,
        posterUrl: hiResPoster,
        runtimeLabel: topItunesMatch?.trackTimeMillis
          ? formatDurationSeconds(Math.round(topItunesMatch.trackTimeMillis / 1000))
          : undefined,
        isPopularMovie: true,
        watchProviders:
          tmdbData?.topMatch?.watchProviders || [
            {
              name: 'JustWatch',
              url: `https://www.justwatch.com/us/search?q=${encodeURIComponent(
                tmdbData?.topMatch?.title || topImdbMatch?.l || query
              )}`,
            },
            {
              name: 'Tubi (Free)',
              url: `https://tubitv.com/search/${encodeURIComponent(
                tmdbData?.topMatch?.title || topImdbMatch?.l || query
              )}`,
            },
            {
              name: 'IMDb',
              url: `https://www.imdb.com/find/?q=${encodeURIComponent(
                tmdbData?.topMatch?.title || topImdbMatch?.l || query
              )}&s=tt`,
            },
          ],
        licensingNotice: null,
        detectedIntent: isNewQuery ? 'genre_or_mood' : 'popular_movie',
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
        imdbTop: topImdbMatch,
      })
    : null;

  // Determine strict full-movie search queries for outside-the-app discovery
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

  // Collect known filmography titles for actor/director/franchise searches (including live TMDB person movie_credits)
  // so genuine full movies whose upload titles omit the actor/director's name (e.g. "Acrimony", "Why Did I Get Married?") are accepted.
  const tmdbPersonFilmography = isActorOrDirectorQuery
    ? await fetchTmdbPersonFilmography(primaryTitle || query, tmdbApiKey)
    : [];

  const knownTitles = Array.from(
    new Set(
      [
        ...tmdbPersonFilmography,
        ...(aiData?.relatedPopularMovies || []).map((r) => r.title),
        ...catalogResult.items.slice(0, 12).map((m) => m.title),
        ...imdbRecords.slice(0, 8).map((r) => r.l),
        ...wikiPages
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
              ? aiData.youtubeSearchQueries.filter((sq) => !/\btrailer\b/i.test(sq))
              : []),
            `${primaryTitle} best full movies`,
            `${primaryTitle} full stage play movie`,
          ].filter((s) => s && s.trim().length >= 3)
        )
      ).slice(0, 4)
    : Array.from(
        new Set(
          [
            `${primaryTitle} ${cleanReleaseYear} full movie`.trim(),
            `${primaryTitle} full movie english`.trim(),
            ...(!geminiOverriddenByLiveDb && Array.isArray(aiData?.youtubeSearchQueries)
              ? aiData.youtubeSearchQueries.filter((sq) => !/\btrailer\b/i.test(sq))
              : []),
            `${primaryTitle} full movie`,
          ].filter((s) => s && s.trim().length >= 3)
        )
      ).slice(0, 3);

  // Run ALL sources in parallel: YouTube Full (>20 min) + YouTube Official Trailers (fallback) + Dailymotion + Vimeo + Internet Archive + Live 2026 New Releases
  const shouldFetchTrailers = !isNewQuery && !isGenreQuery;
  const isCommercialStudioRelease =
    !isActorOrDirectorQuery &&
    Boolean(tmdbData?.topMatch?.isCommercialStudioRelease);
  const [
    fullMovieBatches,
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
      existingIds: existingVideoIds,
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
      existingIds: existingVideoIds,
      genreLabel,
      isGenreQuery,
      maxResults: 5,
    }),
    searchInternetArchiveOutsideApp({
      query,
      primaryTitle,
      existingIds: existingVideoIds,
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
      existingIds: existingVideoIds,
      tmdbApiKey,
      maxResults: 6,
    }),
  ]);

  const validFullCandidates = fullMovieBatches.flat().filter((c) =>
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

  // Inject TMDB's verified official YouTube trailer key first when available
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

  // Prioritize FULL MOVIES first (up to 20 distinct YouTube full movies), and keep trailers strictly as secondary / fallback
  const dedupedCandidates: Array<
    YouTubeCandidate & { releaseKind: 'full_movie' | 'official_trailer' }
  > = [];
  const seenCandidateIds = new Set<string>();
  const seenCandidateCanon = new Set<string>();

  // Sort longer feature-length full movies (>= 50 min) ahead of shorter uploads before slicing
  const sortedFullCandidates = [...validFullCandidates].sort(
    (a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0)
  );

  for (const c of sortedFullCandidates) {
    if (seenCandidateIds.has(c.videoId) || existingVideoIds.has(c.videoId)) continue;
    const canon = extractCanonicalMovieKey(c.title);
    if (canon && seenCandidateCanon.has(canon)) continue;
    seenCandidateIds.add(c.videoId);
    if (canon) seenCandidateCanon.add(canon);
    dedupedCandidates.push({ ...c, releaseKind: 'full_movie' });
    if (dedupedCandidates.length >= 20) break;
  }
  const hasFullCandidatesElsewhere =
    dedupedCandidates.length > 0 ||
    dailymotionMovies.some((m) => m.releaseKind === 'full_movie') ||
    archiveMovies.length > 0 ||
    vimeoMovies.length > 0;
  const trailerLimit = hasFullCandidatesElsewhere ? 2 : 5;
  let addedTrailers = 0;
  for (const c of mergedTrailerPool) {
    if (addedTrailers >= trailerLimit) break;
    if (!seenCandidateIds.has(c.videoId) && !existingVideoIds.has(c.videoId)) {
      seenCandidateIds.add(c.videoId);
      dedupedCandidates.push({ ...c, releaseKind: 'official_trailer' });
      addedTrailers += 1;
    }
  }

  // Verify YouTube embeddability in parallel batches so every card plays smoothly inside TK STORYWORLD
  const topCandidates = dedupedCandidates.slice(0, 22);
  const verifiedYouTubeList = await Promise.all(
    topCandidates.map(async (c) => {
      const oembed = await Promise.race([
        verifyYouTubeOEmbed(c.videoId),
        new Promise<{
          exists: boolean;
          embeddable: boolean;
          title?: string;
          authorName?: string;
          thumbnailUrl?: string;
        }>((resolve) =>
          setTimeout(() => resolve({ exists: false, embeddable: false }), 2400)
        ),
      ]);
      if (!oembed.exists || !oembed.embeddable) {
        return null;
      }

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
              `Discovered outside the app for "${query}". Stream full-screen inside TK STORYWORLD or download to your device.`,
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

  const youtubeOutsideMovies = verifiedYouTubeList.filter(
    (item): item is OutsideAppMovieResult => item !== null
  );

  // Interleave YouTube + Dailymotion + Internet Archive + Live 2026 Premieres + Vimeo cleanly
  const outsideMovies = interleaveMultiSourceMovies(
    [youtubeOutsideMovies, dailymotionMovies, archiveMovies, live2026Drops, vimeoMovies],
    32
  );

  // If a specific popular/2026 commercial movie only returned official trailers (studios copyright-lock full uploads on YT/DM/Vimeo/Archive),
  // explain clearly to the user and expose official streaming links on the Recognized card
  const hasAnyFullMovieMatch = outsideMovies.some((m) => m.releaseKind === 'full_movie');
  if (recognizedMovie && !isNewQuery && !hasAnyFullMovieMatch) {
    recognizedMovie.licensingNotice =
      'New commercial & studio movies are copyright-protected, so YouTube, Dailymotion, Vimeo & Internet Archive only allow the Official Trailer. Watch the trailer here or stream the full film via official platforms below.';
  }

  // Merge AI related popular movies + IMDb + Wikipedia + iTunes movie discoveries
  const relatedMap = new Map<string, SmartMovieSuggestion>();
  for (const rel of aiData?.relatedPopularMovies || []) {
    const key = rel.title.toLowerCase().trim();
    if (!key) continue;
    const matchedImdb = imdbRecords.find((m) => m.l.toLowerCase().includes(key));
    const matchedPoster = itunesRecords.find(
      (r) => r.trackName && r.trackName.toLowerCase().includes(key)
    )?.artworkUrl100;
    relatedMap.set(key, {
      title: rel.title,
      year: rel.year || '',
      genre: rel.genre || 'Feature Film',
      synopsis: rel.synopsis,
      whySimilar: rel.whySimilar,
      youtubeQuery: rel.youtubeQuery || `${rel.title} full movie`,
      posterUrl:
        matchedImdb?.i?.imageUrl ||
        (matchedPoster ? matchedPoster.replace('100x100bb', '600x600bb') : undefined),
    });
  }

  for (const m of imdbRecords.slice(0, 6)) {
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

  for (const p of wikiPages.slice(0, 5)) {
    const title = p.title.replace(/\s*\([^)]*film[^)]*\)/i, '').trim();
    const key = title.toLowerCase();
    if (!title || key === primaryTitle.toLowerCase().trim() || relatedMap.has(key)) continue;
    const yr = p.extract?.match(/\b(19\d{2}|20[0-2]\d)\b/)?.[1] || '';
    relatedMap.set(key, {
      title,
      year: yr,
      genre: recognizedMovie?.primaryGenre || 'Feature Film',
      synopsis: (p.extract || '').slice(0, 200),
      whySimilar: `Related film matching "${query}"`,
      youtubeQuery: `${title} ${yr} full movie`.trim(),
      posterUrl: p.thumbnail?.source,
    });
  }

  for (const rec of itunesRecords.slice(0, 6)) {
    const title = rec.trackName?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (
      key === primaryTitle.toLowerCase().trim() ||
      relatedMap.has(key)
    ) {
      continue;
    }
    relatedMap.set(key, {
      title,
      year: rec.releaseDate ? rec.releaseDate.slice(0, 4) : '',
      genre: rec.primaryGenreName || 'Feature Film',
      synopsis:
        (rec.longDescription || rec.shortDescription || '').slice(0, 200) ||
        `Popular ${rec.primaryGenreName || 'cinema'} release directed by ${
          rec.artistName || 'renowned filmmakers'
        }.`,
      whySimilar: `Matches "${query}" in global cinema listings`,
      youtubeQuery: `${title} ${rec.releaseDate?.slice(0, 4) || ''} full movie`.trim(),
      posterUrl: rec.artworkUrl100
        ? rec.artworkUrl100.replace('100x100bb', '600x600bb')
        : undefined,
    });
  }

  // Include TMDB related movies at the front of related suggestions when available
  for (const rel of tmdbData?.related || []) {
    const key = rel.title.toLowerCase().trim();
    if (!key || key === primaryTitle.toLowerCase().trim() || relatedMap.has(key)) {
      continue;
    }
    relatedMap.set(key, rel);
  }

  // Enrich TMDB catalog results with verified trailer availability if matched to tmdbData.topMatch
  const enrichedCatalogMovies: ExternalCatalogMovieItem[] = catalogResult.items.map((item) => {
    if (
      tmdbData?.topMatch &&
      item.tmdbId === tmdbData.topMatch.tmdbId &&
      tmdbData.topMatch.officialTrailerKey &&
      item.availabilityStatus !== 'FULL_MOVIE_AVAILABLE'
    ) {
      return {
        ...item,
        trailerVideoId: tmdbData.topMatch.officialTrailerKey,
        availabilityStatus:
          item.availabilityStatus === 'COMING_SOON' ? 'COMING_SOON' : 'TRAILER_AVAILABLE',
      };
    }
    return item;
  });

  const latestSection = [...enrichedCatalogMovies]
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    .slice(0, 8);
  const trendingSection = [...enrichedCatalogMovies]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 8);
  const popularSection = [...enrichedCatalogMovies]
    .sort((a, b) => b.voteCount - a.voteCount || b.rating - a.rating)
    .slice(0, 8);

  const relatedList = Array.from(relatedMap.values()).slice(0, 8);
  const alternativeSuggestions = Array.from(
    new Set([
      ...(finalCorrectedQuery ? [finalCorrectedQuery] : []),
      ...relatedList.slice(0, 4).map((r) => r.title),
      ...(enrichedCatalogMovies.length === 0 && outsideMovies.length === 0
        ? ['Horror Movies', 'Action Movies', 'Nollywood Movies', 'Latest 2026 Movies']
        : []),
    ])
  ).slice(0, 6);

  const queryMode: SearchQueryMode = isPlotQuery
    ? 'plot_description'
    : finalCorrectedQuery
    ? 'typo_or_partial'
    : isNewQuery
    ? 'trending_or_latest'
    : 'exact_title';

  const finalResponse: SmartMovieSearchResponse = {
    query,
    effectiveQuery: finalCorrectedQuery || effectiveSearchTerm,
    correctedQuery: finalCorrectedQuery,
    queryMode,
    detectedCategory: null,
    sort: resolvedSort,
    page: catalogResult.page,
    totalPages: catalogResult.totalPages,
    totalResults: catalogResult.totalResults,
    hasMore: catalogResult.hasMore,
    isMovieQuery: true,
    rejectionReason: null,
    recognizedMovie,
    outsideMovies,
    catalogMovies: enrichedCatalogMovies,
    sections: {
      bestMatches: enrichedCatalogMovies.slice(0, 8),
      latestMovies: latestSection,
      trendingMovies: trendingSection,
      popularMovies: popularSection,
    },
    relatedSuggestions: relatedList,
    alternativeSuggestions,
    sourcesSearched: ['TMDB Movies', 'YouTube', 'Dailymotion', 'Vimeo', 'Internet Archive'],
    intelligenceNotice: geminiResult.ok
      ? null
      : `Smart recognition used global film database fallback (${geminiResult.error}).`,
  };

  setCachedSearchResponse(cacheKey, finalResponse, 5 * 60 * 1000);
  return finalResponse;
}

/**
 * Fast, movies-only autocomplete combining local instant category/typo/in-app matches with live TMDB movie titles.
 */
export async function getSmartSearchSuggestions(
  rawQuery: string,
  inAppMovies: MovieItem[] = []
): Promise<SearchSuggestionItem[]> {
  const clean = rawQuery.trim();
  if (clean.length < 2) return [];
  if (detectNonMovieQuery(clean).isNonMovie) return [];

  const localSuggestions = buildLocalSearchSuggestions(clean, inAppMovies);

  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '';
  const inAppLookup = new Map<string, string>();
  for (const m of inAppMovies) {
    if (m.approvalStatus === 'approved' && m.playbackStatus === 'active') {
      const norm = normalizeSearchText(m.title);
      if (norm && !inAppLookup.has(norm)) inAppLookup.set(norm, m.id);
    }
  }

  const typo = findTypoCorrection(
    clean,
    inAppMovies.slice(0, 200).map((m) => m.title)
  );
  const tmdbTerm = typo?.kind === 'movie_title' ? typo.corrected : clean;

  const tmdbSuggestions = await searchTmdbMovieSuggestions({
    query: tmdbTerm,
    apiKey: tmdbApiKey,
    inAppLookup,
  });

  const merged: SearchSuggestionItem[] = [];
  const seen = new Set<string>();
  const push = (item: SearchSuggestionItem) => {
    const key = normalizeSearchText(item.text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  // Prioritize typo corrections, category completions & compressed-prefix movie titles first,
  // then in-app playable titles, then live TMDB movie suggestions, then remaining local suggestions
  const normClean = normalizeSearchText(clean);
  for (const s of localSuggestions.filter((x) => x.kind === 'correction' || x.kind === 'category' || x.kind === 'trending')) {
    push(s);
  }
  for (const s of localSuggestions.filter((x) => x.inAppMovieId)) {
    push(s);
  }
  // If TMDB results don't directly start with the user's input (e.g. compressed prefix "Avng" -> "Avengers"),
  // promote matching canonical local movies ahead of noisy TMDB substring hits
  const tmdbHasDirectPrefix = tmdbSuggestions.some((t) =>
    normalizeSearchText(t.text).startsWith(normClean)
  );
  if (!tmdbHasDirectPrefix) {
    for (const s of localSuggestions.filter((x) => x.kind === 'movie_title')) {
      push(s);
    }
  }
  for (const s of tmdbSuggestions) {
    push(s);
  }
  for (const s of localSuggestions) {
    push(s);
  }

  return merged.slice(0, 10);
}

/**
 * Resolves an official playable YouTube trailer + verified watch providers for an external TMDB movie card.
 */
export async function resolveMovieTrailerOnDemand(options: {
  tmdbId?: number;
  title: string;
  year?: string;
}): Promise<{
  videoId: string | null;
  watchProviders: Array<{ name: string; url: string }>;
}> {
  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '';
  return resolveTmdbMovieTrailer({
    ...options,
    apiKey: tmdbApiKey,
  });
}

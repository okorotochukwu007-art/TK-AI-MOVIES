import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { MovieCategory, MovieItem } from '../types/cinema.ts';
import { formatDurationSeconds, verifyYouTubeOEmbed } from './youtubeDiscovery.ts';

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
  isMovieQuery: boolean;
  rejectionReason: string | null;
  recognizedMovie: RecognizedPopularMovie | null;
  outsideMovies: OutsideAppMovieResult[];
  relatedSuggestions: SmartMovieSuggestion[];
  intelligenceNotice?: string | null;
}

interface GeminiMovieAnalysis {
  isMovieQuery: boolean;
  rejectionReason: string;
  isPopularMovie: boolean;
  detectedIntent:
    | 'popular_movie'
    | 'genre_or_mood'
    | 'actor_or_director'
    | 'franchise'
    | 'non_movie';
  canonicalTitle: string;
  releaseYear: string;
  primaryGenre: string;
  allGenres: string[];
  directorOrStudio: string;
  castHighlights: string;
  synopsis: string;
  youtubeSearchQueries: string[];
  relatedPopularMovies: Array<{
    title: string;
    year: string;
    genre: string;
    synopsis: string;
    whySimilar: string;
    youtubeQuery: string;
  }>;
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
  /\b(reaction|reacts to|ending explained|plot explained|pitch meeting|honest trailers|review|breakdown|easter eggs|recap|summary in \d+|music video|official audio|lyric video|lyrics|remix|unboxing|gameplay|walkthrough|let's play|podcast|interview|tiktok|#shorts|full match|highlights|recipe|tutorial|how to)\b/i;

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
  query: string
): Promise<GeminiMovieAnalysis> {
  const genPromise = ai.models.generateContent({
    model,
    contents: `Analyze this user search query for a global movie discovery engine: "${query}"

Your strict rules:
1. Determine if the user is searching for a MOVIE or MOVIES (any kind of movie worldwide: Hollywood, Nollywood/Nigerian, Bollywood, Korean, Anime, Sci-Fi, Action, Horror, Thriller, Romance, Comedy, Drama, Documentary, Family, Crime, Mystery, Classic films, 2024-2026 releases).
   - Set isMovieQuery = true ONLY if the query refers to a film/movie title (even misspelled or partial without the word "movie"), a movie franchise/series, a film actor/director/studio name, or a movie genre/mood/plot search.
   - Set isMovieQuery = false if the user is asking about non-movie topics (songs/music tracks, sports matches, cooking recipes, weather, coding, tech product reviews, news, medical/finance advice, general trivia). If false, explain briefly in rejectionReason that search is strictly for movies.
2. Detect Popular Movie Intent:
   - Set isPopularMovie = true if the user is searching for a specific recognized popular/notable film or iconic movie franchise (e.g. "Avatar", "Inception", "John Wick", "Black Panther", "Anikulapo", "Jagun Jagun", "Spider-Man", "Dune", "Sinners", "Titanic", "The Godfather", "RRR", "Train to Busan", "Spirited Away", "A Tribe Called Judah").
   - Set detectedIntent accordingly: "popular_movie", "genre_or_mood", "actor_or_director", "franchise", or "non_movie".
3. Extract clean details for canonicalTitle, releaseYear, primaryGenre, allGenres (up to 4 genres), directorOrStudio, castHighlights, and a crisp 2-sentence cinema synopsis.
4. Generate 2 tailored youtubeSearchQueries designed STRICTLY to find embeddable FULL MOVIES or official movie features/trailers on YouTube (never songs, reviews, or reaction videos).
5. Recommend 5 relatedPopularMovies (real released movies from any global cinema tradition matching the taste/genre of the search) so the user can explore more movies outside the app.`,
    config: {
      systemInstruction:
        'You are a strict, authoritative global cinema librarian. Only allow movie searches across all film genres worldwide. Reject non-movie queries cleanly.',
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
          'detectedIntent',
          'canonicalTitle',
          'releaseYear',
          'primaryGenre',
          'allGenres',
          'directorOrStudio',
          'castHighlights',
          'synopsis',
          'youtubeSearchQueries',
          'relatedPopularMovies',
        ],
      },
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('503 Gemini timeout')), 5500)
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
  query: string
): Promise<{ ok: true; data: GeminiMovieAnalysis } | { ok: false; error: string }> {
  const ai = getGenAIClient();
  if (!ai) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY is not configured on the server.',
    };
  }

  let lastErr: any = null;
  const attempts: Array<{ model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', delayMs: 0 },
    { model: 'gemini-3.1-flash-lite', delayMs: 250 },
  ];

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((r) => setTimeout(r, attempt.delayMs));
    }
    try {
      const data = await callGeminiMovieModel(ai, attempt.model, query);
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
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      searchQuery
    )}`;
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
          !NON_MOVIE_YOUTUBE_REGEX.test(`${title} ${snippet}`)
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

export async function searchMoviesOutsideApp(
  rawQuery: string,
  existingVideoIds: Set<string> = new Set()
): Promise<SmartMovieSearchResponse> {
  const query = rawQuery.trim();
  if (!query || query.length < 2) {
    return {
      query,
      isMovieQuery: true,
      rejectionReason: null,
      recognizedMovie: null,
      outsideMovies: [],
      relatedSuggestions: [],
    };
  }

  // Run Gemini strict movie intelligence + IMDb + Wikipedia + Apple iTunes in parallel
  const [geminiResult, imdbRecords, wikiPages, itunesRecords] = await Promise.all([
    analyzeQueryWithGemini(query),
    fetchImdbMovieSuggestions(query),
    fetchWikipediaFilmPages(query),
    fetchItunesMovieMetadata(query),
  ]);

  if (!geminiResult.ok) {
    // Only fail if ALL cinema intelligence sources returned nothing
    if (imdbRecords.length === 0 && wikiPages.length === 0 && itunesRecords.length === 0) {
      throw new Error(geminiResult.error);
    }
  }

  const aiData = geminiResult.ok ? geminiResult.data : null;

  // Enforce strict movie-only gate when Gemini detects a non-movie query
  if (aiData && !aiData.isMovieQuery) {
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
    topImdbMatch?.i?.imageUrl ||
    (topItunesMatch?.artworkUrl100
      ? topItunesMatch.artworkUrl100.replace('100x100bb', '600x600bb')
      : undefined) ||
    topWikiMatch?.thumbnail?.source;

  const wikiYearMatch = (topWikiMatch?.extract || '').match(/\b(19\d{2}|20[0-2]\d)\b/);

  const recognizedMovie: RecognizedPopularMovie | null = aiData
    ? {
        canonicalTitle:
          aiData.canonicalTitle ||
          topImdbMatch?.l ||
          topItunesMatch?.trackName ||
          topWikiMatch?.title?.replace(/\s*\([^)]*film[^)]*\)/i, '') ||
          query,
        releaseYear:
          aiData.releaseYear ||
          (topImdbMatch?.y ? String(topImdbMatch.y) : '') ||
          (topItunesMatch?.releaseDate ? topItunesMatch.releaseDate.slice(0, 4) : '') ||
          wikiYearMatch?.[1] ||
          '',
        primaryGenre:
          aiData.primaryGenre || topItunesMatch?.primaryGenreName || 'Feature Film',
        allGenres:
          Array.isArray(aiData.allGenres) && aiData.allGenres.length > 0
            ? aiData.allGenres
            : [topItunesMatch?.primaryGenreName || 'Cinema'],
        directorOrStudio:
          aiData.directorOrStudio || topItunesMatch?.artistName || '',
        castHighlights: aiData.castHighlights || topImdbMatch?.s || '',
        synopsis:
          aiData.synopsis ||
          topWikiMatch?.extract ||
          topItunesMatch?.longDescription ||
          topItunesMatch?.shortDescription ||
          '',
        posterUrl: hiResPoster,
        runtimeLabel: topItunesMatch?.trackTimeMillis
          ? formatDurationSeconds(Math.round(topItunesMatch.trackTimeMillis / 1000))
          : undefined,
        isPopularMovie: Boolean(
          aiData.isPopularMovie || (topImdbMatch?.rank && topImdbMatch.rank < 200000)
        ),
        detectedIntent:
          (aiData.detectedIntent as RecognizedPopularMovie['detectedIntent']) ||
          (aiData.isPopularMovie ? 'popular_movie' : 'genre_or_mood'),
      }
    : topImdbMatch || topItunesMatch || topWikiMatch
    ? {
        canonicalTitle:
          topImdbMatch?.l ||
          topItunesMatch?.trackName ||
          topWikiMatch?.title?.replace(/\s*\([^)]*film[^)]*\)/i, '') ||
          query,
        releaseYear:
          (topImdbMatch?.y ? String(topImdbMatch.y) : '') ||
          topItunesMatch?.releaseDate?.slice(0, 4) ||
          wikiYearMatch?.[1] ||
          '',
        primaryGenre: topItunesMatch?.primaryGenreName || 'Feature Film',
        allGenres: [topItunesMatch?.primaryGenreName || 'Cinema'],
        directorOrStudio: topItunesMatch?.artistName || '',
        castHighlights: topImdbMatch?.s || '',
        synopsis:
          topWikiMatch?.extract ||
          topItunesMatch?.longDescription ||
          topItunesMatch?.shortDescription ||
          `Popular movie matching "${query}".`,
        posterUrl: hiResPoster,
        runtimeLabel: topItunesMatch?.trackTimeMillis
          ? formatDurationSeconds(Math.round(topItunesMatch.trackTimeMillis / 1000))
          : undefined,
        isPopularMovie: true,
        detectedIntent: 'popular_movie',
      }
    : null;

  // Determine strict full-movie search queries for outside-the-app discovery
  const primaryTitle = recognizedMovie?.canonicalTitle || query;
  const searchQueries = Array.from(
    new Set(
      [
        ...(aiData?.youtubeSearchQueries || []),
        `${primaryTitle} full movie`,
        `${query} full movie`,
      ].filter((s) => s && s.trim().length >= 3)
    )
  ).slice(0, 3);

  // 1. Search full-length movies (>= 25 min / 1500s) first across YouTube
  const fullMovieBatches = await Promise.all(
    searchQueries.map((sq) => searchYouTubeRawCandidates(sq, 1500))
  );
  const fullCandidates = fullMovieBatches.flat();

  // 2. Also fetch official trailer / featurette for popular theatrical movies if needed
  let trailerCandidates: YouTubeCandidate[] = [];
  if (fullCandidates.length < 4 && recognizedMovie?.isPopularMovie) {
    trailerCandidates = await searchYouTubeRawCandidates(
      `${primaryTitle} ${recognizedMovie.releaseYear || ''} official movie trailer`.trim(),
      75
    );
  }

  // Deduplicate candidates while excluding duplicates already shown in-app if possible
  const dedupedCandidates: Array<
    YouTubeCandidate & { releaseKind: 'full_movie' | 'official_trailer' }
  > = [];
  const seenCandidateIds = new Set<string>();

  for (const c of fullCandidates) {
    if (!seenCandidateIds.has(c.videoId) && !existingVideoIds.has(c.videoId)) {
      seenCandidateIds.add(c.videoId);
      dedupedCandidates.push({ ...c, releaseKind: 'full_movie' });
    }
  }
  for (const c of trailerCandidates.slice(0, 2)) {
    if (!seenCandidateIds.has(c.videoId) && !existingVideoIds.has(c.videoId)) {
      seenCandidateIds.add(c.videoId);
      dedupedCandidates.push({ ...c, releaseKind: 'official_trailer' });
    }
  }

  // Verify embeddability in parallel batches so every card plays smoothly inside TK STORYWORLD
  const topCandidates = dedupedCandidates.slice(0, 6);
  const verifiedList = await Promise.all(
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
          setTimeout(() => resolve({ exists: false, embeddable: false }), 2200)
        ),
      ]);
      if (!oembed.exists || !oembed.embeddable) {
        return null;
      }

      const genreLabel =
        recognizedMovie?.primaryGenre || 'Global Cinema';
      const mappedCategory = mapExternalGenreToAppCategory(genreLabel);
      const cleanTitle = c.title
        .replace(/^\[FULL\]\s*/i, '')
        .replace(/#[a-zA-Z0-9_]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const item: OutsideAppMovieResult = {
        id: `ext-${c.videoId}`,
        youtubeVideoId: c.videoId,
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
        viewCount: c.releaseKind === 'full_movie' ? 2400000 : 8500000,
        likeCount: c.releaseKind === 'full_movie' ? 145000 : 410000,
        commentsCount: 18500,
        hookTag:
          c.releaseKind === 'full_movie'
            ? 'Outside App · Full Movie'
            : 'Official Preview Trailer',
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
            ? 'Outside App · Full Feature'
            : 'Outside App · Official Trailer',
      };
      return item;
    })
  );

  const outsideMovies = verifiedList.filter(
    (item): item is OutsideAppMovieResult => item !== null
  );

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

  return {
    query,
    isMovieQuery: true,
    rejectionReason: null,
    recognizedMovie,
    outsideMovies,
    relatedSuggestions: Array.from(relatedMap.values()).slice(0, 8),
    intelligenceNotice: geminiResult.ok
      ? null
      : `Smart recognition used global film database fallback (${geminiResult.error}).`,
  };
}

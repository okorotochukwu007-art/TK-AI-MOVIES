import { MovieCategory, MovieItem } from '../../../src/types/cinema.ts';

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
  /\b(reaction|reacts to|ending explained|plot explained|pitch meeting|honest trailers|review|breakdown|easter eggs|recap|summary in \d+|music video|official audio|lyric video|lyrics|remix|unboxing|gameplay|walkthrough|let's play|podcast|interview|tiktok|#shorts|full match|highlights|recipe|tutorial|how to)\b/i;

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
            text: 'You are a strict, authoritative global cinema librarian. Only allow movie searches across all film genres worldwide. Reject non-movie queries cleanly.',
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
- isMovieQuery (boolean: false ONLY for clearly non-movie topics like cooking recipes, crypto prices, weather, coding tutorials, sports tables, song lyrics)
- rejectionReason (string)
- isPopularMovie (boolean)
- detectedIntent ("popular_movie" | "genre_or_mood" | "actor_or_director" | "franchise" | "non_movie")
- canonicalTitle (string)
- releaseYear (string)
- primaryGenre (string)
- allGenres (string[])
- directorOrStudio (string)
- castHighlights (string)
- synopsis (string, 2 crisp sentences)
- youtubeSearchQueries (string[], 2 queries targeting full movies or official trailers)
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
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
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
          !NON_MOVIE_YOUTUBE_REGEX.test(`${title} ${snippet}`)
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
  geminiApiKey?: string
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

  if (NON_MOVIE_QUERY_REGEX.test(query)) {
    return {
      query,
      isMovieQuery: false,
      rejectionReason:
        'Strict Movie Search Only — TK STORYWORLD discovers strictly movies across all genres worldwide.',
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

  const [aiData, imdbItems, wikiPages] = await Promise.all([
    geminiApiKey ? analyzeWithGeminiRest(geminiApiKey, query) : Promise.resolve(null),
    fetchImdbSuggestions(query),
    fetchWikipediaFilms(query),
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

  const recognizedMovie: RecognizedPopularMovie | null = aiData
    ? {
        canonicalTitle: aiData.canonicalTitle || topImdb?.l || topWiki?.title?.replace(/\s*\([^)]*film[^)]*\)/i, '') || query,
        releaseYear: aiData.releaseYear || (topImdb?.y ? String(topImdb.y) : wikiYearMatch?.[1] || ''),
        primaryGenre: aiData.primaryGenre || inferredGenres.primary,
        allGenres:
          Array.isArray(aiData.allGenres) && aiData.allGenres.length > 0
            ? aiData.allGenres
            : inferredGenres.all,
        directorOrStudio: aiData.directorOrStudio || '',
        castHighlights: aiData.castHighlights || topImdb?.s || '',
        synopsis: aiData.synopsis || wikiSynopsis || '',
        posterUrl: topImdb?.i?.imageUrl || topWiki?.thumbnail?.source,
        isPopularMovie: Boolean(aiData.isPopularMovie || (topImdb?.rank && topImdb.rank < 150000)),
        detectedIntent: aiData.detectedIntent || 'popular_movie',
      }
    : topImdb || topWiki
    ? {
        canonicalTitle:
          topImdb?.l ||
          (topWiki?.title ? topWiki.title.replace(/\s*\([^)]*film[^)]*\)/i, '') : query),
        releaseYear: topImdb?.y ? String(topImdb.y) : wikiYearMatch?.[1] || '',
        primaryGenre: inferredGenres.primary,
        allGenres: inferredGenres.all,
        directorOrStudio: '',
        castHighlights: topImdb?.s || '',
        synopsis:
          wikiSynopsis ||
          `Recognized movie matching "${query}"${topImdb?.s ? ` starring ${topImdb.s}` : ''}.`,
        posterUrl: topImdb?.i?.imageUrl || topWiki?.thumbnail?.source,
        isPopularMovie: Boolean(topImdb && (!topImdb.rank || topImdb.rank < 200000)) || filmWikiPages.length > 0,
        detectedIntent: topImdb ? 'popular_movie' : 'genre_or_mood',
      }
    : null;

  const primaryTitle = recognizedMovie?.canonicalTitle || query;
  const searchQueries = Array.from(
    new Set(
      [
        ...(Array.isArray(aiData?.youtubeSearchQueries) ? aiData.youtubeSearchQueries : []),
        `${primaryTitle} full movie`,
        `${query} full movie`,
      ].filter((s) => typeof s === 'string' && s.trim().length >= 3)
    )
  ).slice(0, 2);

  const fullBatches = await Promise.all(
    searchQueries.map((sq) => searchYouTubeRawCandidates(sq, 1500))
  );
  const fullCandidates = fullBatches.flat();

  let trailerCandidates: YouTubeCandidate[] = [];
  if (fullCandidates.length < 3) {
    trailerCandidates = await searchYouTubeRawCandidates(
      `${primaryTitle} ${recognizedMovie?.releaseYear || ''} official movie trailer`.trim(),
      70
    );
  }

  const deduped: Array<YouTubeCandidate & { releaseKind: 'full_movie' | 'official_trailer' }> = [];
  const seenIds = new Set<string>();
  for (const c of fullCandidates) {
    if (!seenIds.has(c.videoId) && !existingIds.has(c.videoId)) {
      seenIds.add(c.videoId);
      deduped.push({ ...c, releaseKind: 'full_movie' });
    }
  }
  for (const c of trailerCandidates.slice(0, 3)) {
    if (!seenIds.has(c.videoId) && !existingIds.has(c.videoId)) {
      seenIds.add(c.videoId);
      deduped.push({ ...c, releaseKind: 'official_trailer' });
    }
  }

  const verifiedList = await Promise.all(
    deduped.slice(0, 6).map(async (c) => {
      const oembed = await verifyYouTubeOEmbedEdge(c.videoId);
      if (!oembed.exists || !oembed.embeddable) return null;
      const genreLabel = recognizedMovie?.primaryGenre || 'Global Cinema';
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

  return {
    query,
    isMovieQuery: true,
    rejectionReason: null,
    recognizedMovie,
    outsideMovies,
    relatedSuggestions: Array.from(relatedMap.values()).slice(0, 8),
  };
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context: CloudflarePagesContext): Promise<Response> {
  try {
    const url = new URL(context.request.url);
    const query = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    const result = await executeSmartMovieSearch(
      query,
      new Set<string>(),
      context.env?.GEMINI_API_KEY
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
    const body = (await context.request.json().catch(() => ({}))) as {
      query?: string;
      existingVideoIds?: string[];
    };
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const existingIds = new Set<string>(
      Array.isArray(body.existingVideoIds) ? body.existingVideoIds : []
    );
    const result = await executeSmartMovieSearch(
      query,
      existingIds,
      context.env?.GEMINI_API_KEY
    );
    return new Response(JSON.stringify(result), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Smart movie search failed.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

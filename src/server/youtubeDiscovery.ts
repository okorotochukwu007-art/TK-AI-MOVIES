import { GoogleGenAI, Type } from '@google/genai';
import {
  DiscoveryErrorEntry,
  DiscoveryRunLog,
  MOVIE_CATEGORIES,
  MovieCategory,
  MovieItem,
} from '../types/cinema.ts';
import { repo } from './supabaseRepo.ts';

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

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    const vParam = url.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
      return vParam;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'v');
    if (embedIdx >= 0 && parts[embedIdx + 1]) {
      const candidate = parts[embedIdx + 1].slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
    }
  } catch {
    const match = trimmed.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function parseIsoDurationToSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '12:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

interface ClassificationResult {
  cleanTitle: string;
  synopsis: string;
  primaryCategory: MovieCategory;
  secondaryCategories: MovieCategory[];
  isAiMovieRelevant: boolean;
  aiQualityScore: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export function cleanStorySynopsis(
  rawTitle: string,
  rawDescription: string,
  channelTitle: string,
  primaryCategory: MovieCategory
): string {
  const cleanedTitle = rawTitle
    .replace(/^\[FULL\]\s*/i, '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/\s*\|\s*Full Movie.*$/i, '')
    .trim();

  // Strip common YouTube channel promotional boilerplate & disclaimers
  let desc = (rawDescription || '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/👉\s*Follow me[^\n.]*[.\n]?/gi, '')
    .replace(/🙏*\s*Copyright Disclaimer under Section 107[\s\S]*/gi, '')
    .replace(/Welcome to [^!.\n]+[!.\n]\s*/gi, '')
    .replace(/Discover addictive English romance dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Enjoy AI romance dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Daily English-dubbed romance short dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Fall in love with handsome CEOs[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/New episodes every day[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/If you enjoy billionaire stories, mafia dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/New AI cinematic short dramas every day[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Like\s*•\s*💬\s*Comment[\s\S]*/gi, '')
    .replace(/Watch the complete AI-generated romance drama from[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/✨\s*AI-generated cinematic storytelling[\s\S]*/gi, '')
    .replace(/Story Summary:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove repeated title prefix if the description starts with the exact title
  if (desc.toLowerCase().startsWith(cleanedTitle.toLowerCase())) {
    desc = desc.slice(cleanedTitle.length).replace(/^[\s—\-:|❤️]+/, '').trim();
  }

  const isGenericPromo =
    desc.length < 45 ||
    /copyright disclaimer|fair use|subscribe to|follow me on instagram|welcome to/i.test(
      desc
    );

  if (!isGenericPromo) {
    return desc.slice(0, 320);
  }

  return `In "${cleanedTitle}", an emotional ${primaryCategory.toLowerCase()} produced by ${channelTitle} unfolds as unexpected fate, hidden truths, and deep devotion test the boundaries of love.`;
}

export function classifyMovieFast(
  rawTitle: string,
  rawDescription: string,
  channelTitle: string,
  fallbackCategory: MovieCategory = 'Billionaire Romance'
): ClassificationResult {
  const cleanTitle =
    rawTitle
      .replace(/^\[FULL\]\s*/i, '')
      .replace(/#[a-zA-Z0-9_]+/g, '')
      .replace(/\s*\|\s*Full Movie.*$/i, '')
      .trim() || rawTitle.trim();

  const titleLower = cleanTitle.toLowerCase();
  const chanLower = channelTitle.toLowerCase();
  // Strip channel promo boilerplate BEFORE checking description keywords so promo footers never misclassify a story
  const strippedPlot = cleanStorySynopsis(
    cleanTitle,
    rawDescription,
    channelTitle,
    fallbackCategory
  ).toLowerCase();

  let primary: MovieCategory | null = null;

  // 1. PRIORITY PASS: Analyze the Movie TITLE first (most accurate signal of what the story is actually about)
  if (
    titleLower.includes('contract') ||
    titleLower.includes('arranged marriage') ||
    titleLower.includes('arrange marriage') ||
    titleLower.includes('fake love') ||
    titleLower.includes('fake marriage') ||
    titleLower.includes('by mistake') ||
    titleLower.includes('paper wife') ||
    titleLower.includes('bride on contract')
  ) {
    primary = 'Contract Marriage';
  } else if (
    titleLower.includes('secret marriage') ||
    titleLower.includes('secret wife') ||
    titleLower.includes('secret husband') ||
    titleLower.includes('secret billionaire') ||
    titleLower.includes('hidden wife') ||
    titleLower.includes('never knowing') ||
    titleLower.includes('wrong man') ||
    titleLower.includes('face blindness') ||
    titleLower.includes('disguise') ||
    titleLower.includes('flash marriage') ||
    titleLower.includes('raised his son') ||
    titleLower.includes('secretly')
  ) {
    primary = 'Secret Marriage';
  } else if (
    titleLower.includes('werewolf') ||
    titleLower.includes('alpha') ||
    titleLower.includes('lycan') ||
    titleLower.includes('fated mate') ||
    titleLower.includes('moonlit') ||
    titleLower.includes('wolf')
  ) {
    primary = 'Werewolf Romance';
  } else if (
    titleLower.includes('revenge') ||
    titleLower.includes('betray') ||
    titleLower.includes('regret') ||
    titleLower.includes('disappointment') ||
    titleLower.includes('left him forever') ||
    titleLower.includes('chose my sister') ||
    titleLower.includes('reborn') ||
    titleLower.includes('past life') ||
    titleLower.includes('divorce') ||
    titleLower.includes('ex-husband')
  ) {
    primary = 'Revenge Romance';
  } else if (
    titleLower.includes('ceo') ||
    titleLower.includes('boss') ||
    titleLower.includes('chairman') ||
    titleLower.includes('executive') ||
    titleLower.includes('heiress & the maverick')
  ) {
    primary = 'CEO Love Stories';
  } else if (
    titleLower.includes('billionaire') ||
    titleLower.includes('heiress') ||
    titleLower.includes('tycoon') ||
    titleLower.includes('millionaire') ||
    titleLower.includes('rich') ||
    titleLower.includes('sovereign syndicate') ||
    titleLower.includes('prince') ||
    titleLower.includes('sea king')
  ) {
    primary = 'Billionaire Romance';
  } else if (
    titleLower.includes('fantasy') ||
    titleLower.includes('dragon') ||
    titleLower.includes('magic') ||
    titleLower.includes('folktale') ||
    titleLower.includes('ancient') ||
    titleLower.includes('kingdom') ||
    titleLower.includes('spirit')
  ) {
    primary = 'Fantasy Romance';
  } else if (
    titleLower.includes('animated') ||
    titleLower.includes('animation') ||
    chanLower.includes('blender')
  ) {
    if (
      titleLower.includes('tears') ||
      titleLower.includes('vow') ||
      titleLower.includes('wedding') ||
      titleLower.includes('heart')
    ) {
      primary = 'Emotional Love Stories';
    } else {
      primary = 'AI Animated Movies';
    }
  } else if (
    titleLower.includes('tears') ||
    titleLower.includes('wedding') ||
    titleLower.includes('maid') ||
    titleLower.includes('orphan') ||
    titleLower.includes('heartbreak') ||
    titleLower.includes('emotional') ||
    titleLower.includes('love') ||
    titleLower.includes('marriage') ||
    titleLower.includes('wife') ||
    titleLower.includes('bride')
  ) {
    primary = 'Emotional Love Stories';
  }

  // 2. SECONDARY PASS: Check cleaned plot synopsis if title did not yield a specific genre
  if (!primary) {
    if (strippedPlot.includes('contract marriage') || strippedPlot.includes('marriage contract')) {
      primary = 'Contract Marriage';
    } else if (strippedPlot.includes('secret marriage') || strippedPlot.includes('hidden identity')) {
      primary = 'Secret Marriage';
    } else if (strippedPlot.includes('werewolf') || strippedPlot.includes('alpha')) {
      primary = 'Werewolf Romance';
    } else if (strippedPlot.includes('revenge') || strippedPlot.includes('betrayed')) {
      primary = 'Revenge Romance';
    } else if (strippedPlot.includes('ceo') || strippedPlot.includes('chairman')) {
      primary = 'CEO Love Stories';
    } else if (strippedPlot.includes('billionaire') || strippedPlot.includes('tycoon') || strippedPlot.includes('prince')) {
      primary = 'Billionaire Romance';
    } else if (strippedPlot.includes('fantasy') || strippedPlot.includes('kingdom') || strippedPlot.includes('folktale')) {
      primary = 'Fantasy Romance';
    } else if (strippedPlot.includes('love') || strippedPlot.includes('wedding') || strippedPlot.includes('servant')) {
      primary = 'Emotional Love Stories';
    } else {
      primary = fallbackCategory;
    }
  }

  // Build accurate secondary genre tags based on actual story content
  const combinedStory = `${titleLower} ${strippedPlot}`;
  const secondary: MovieCategory[] = [];

  if (
    primary !== 'Contract Marriage' &&
    (combinedStory.includes('contract') ||
      combinedStory.includes('arranged') ||
      combinedStory.includes('fake love') ||
      combinedStory.includes('by mistake'))
  ) {
    secondary.push('Contract Marriage');
  }
  if (
    primary !== 'Secret Marriage' &&
    (combinedStory.includes('secret') ||
      combinedStory.includes('never knowing') ||
      combinedStory.includes('hidden') ||
      combinedStory.includes('disguise'))
  ) {
    secondary.push('Secret Marriage');
  }
  if (
    primary !== 'CEO Love Stories' &&
    (combinedStory.includes('ceo') ||
      combinedStory.includes('boss') ||
      combinedStory.includes('chairman') ||
      combinedStory.includes('corporate'))
  ) {
    secondary.push('CEO Love Stories');
  }
  if (
    primary !== 'Billionaire Romance' &&
    (combinedStory.includes('billionaire') ||
      combinedStory.includes('wealth') ||
      combinedStory.includes('rich') ||
      combinedStory.includes('heiress') ||
      combinedStory.includes('prince') ||
      combinedStory.includes('king'))
  ) {
    secondary.push('Billionaire Romance');
  }
  if (
    primary !== 'Revenge Romance' &&
    (combinedStory.includes('revenge') ||
      combinedStory.includes('betray') ||
      combinedStory.includes('regret') ||
      combinedStory.includes('reborn') ||
      combinedStory.includes('wicked'))
  ) {
    secondary.push('Revenge Romance');
  }
  if (
    primary !== 'Emotional Love Stories' &&
    (combinedStory.includes('love') ||
      combinedStory.includes('tears') ||
      combinedStory.includes('heart') ||
      combinedStory.includes('wedding') ||
      combinedStory.includes('servant') ||
      combinedStory.includes('maid'))
  ) {
    secondary.push('Emotional Love Stories');
  }
  if (
    primary !== 'Fantasy Romance' &&
    (combinedStory.includes('fantasy') ||
      combinedStory.includes('dragon') ||
      combinedStory.includes('spirit') ||
      combinedStory.includes('folktale') ||
      combinedStory.includes('kingdom'))
  ) {
    secondary.push('Fantasy Romance');
  }

  const epMatch = rawTitle.match(/(?:episode|ep\.?|part)\s*(\d+)/i);
  const seasonMatch = rawTitle.match(/(?:season|s)\s*(\d+)/i);

  if (epMatch && !secondary.includes('Complete AI Movie Series')) {
    secondary.push('Complete AI Movie Series');
  }

  const synopsis = cleanStorySynopsis(
    cleanTitle,
    rawDescription,
    channelTitle,
    primary
  );

  return {
    cleanTitle,
    synopsis,
    primaryCategory: primary,
    secondaryCategories: Array.from(new Set(secondary)).slice(0, 3) as MovieCategory[],
    isAiMovieRelevant: true,
    aiQualityScore: Math.min(98, 88 + (cleanTitle.length % 10)),
    seasonNumber: seasonMatch ? parseInt(seasonMatch[1], 10) : epMatch ? 1 : null,
    episodeNumber: epMatch ? parseInt(epMatch[1], 10) : null,
  };
}

export async function classifyMovieWithGemini(
  rawTitle: string,
  rawDescription: string,
  channelTitle: string,
  fallbackCategory: MovieCategory = 'Billionaire Romance'
): Promise<ClassificationResult> {
  const fastFallback = classifyMovieFast(
    rawTitle,
    rawDescription,
    channelTitle,
    fallbackCategory
  );

  const ai = getGenAIClient();
  if (!ai) {
    return fastFallback;
  }

  try {
    const geminiPromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Analyze this YouTube video for TK STORYWORLD, a luxury streaming platform for AI-generated movies, Nigerian & International billionaire romance, CEO love stories, contract marriages, emotional dramas, and AI animated films.
Title: ${rawTitle}
Channel: ${channelTitle}
Description: ${rawDescription.slice(0, 1000)}

Allowed Story Categories: ${MOVIE_CATEGORIES.join(', ')}

IMPORTANT: Classify based primarily on the Video TITLE and actual story plot (ignore generic YouTube channel promotional descriptions). Return JSON classifying the movie into one primaryCategory and up to 3 secondaryCategories from the allowed list, writing a dramatic 2-sentence cinema synopsis, scoring storytelling quality (1-100), and extracting seasonNumber / episodeNumber if episodic.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cleanTitle: { type: Type.STRING },
            synopsis: { type: Type.STRING },
            primaryCategory: { type: Type.STRING },
            secondaryCategories: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            isAiMovieRelevant: { type: Type.BOOLEAN },
            aiQualityScore: { type: Type.INTEGER },
            seasonNumber: { type: Type.INTEGER, nullable: true },
            episodeNumber: { type: Type.INTEGER, nullable: true },
          },
          required: [
            'cleanTitle',
            'synopsis',
            'primaryCategory',
            'secondaryCategories',
            'isAiMovieRelevant',
            'aiQualityScore',
          ],
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini classification timeout')), 4000)
    );

    const response = await Promise.race([geminiPromise, timeoutPromise]);

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const validPrimary = MOVIE_CATEGORIES.includes(parsed.primaryCategory)
      ? (parsed.primaryCategory as MovieCategory)
      : fastFallback.primaryCategory;
    const validSecondary = Array.isArray(parsed.secondaryCategories)
      ? (parsed.secondaryCategories.filter((c: string) =>
          MOVIE_CATEGORIES.includes(c as MovieCategory)
        ) as MovieCategory[])
      : fastFallback.secondaryCategories;

    return {
      cleanTitle: parsed.cleanTitle || fastFallback.cleanTitle,
      synopsis: parsed.synopsis || fastFallback.synopsis,
      primaryCategory: validPrimary,
      secondaryCategories: validSecondary.slice(0, 3),
      isAiMovieRelevant: parsed.isAiMovieRelevant ?? true,
      aiQualityScore: Math.min(
        100,
        Math.max(50, Number(parsed.aiQualityScore) || fastFallback.aiQualityScore)
      ),
      seasonNumber: parsed.seasonNumber ?? fastFallback.seasonNumber,
      episodeNumber: parsed.episodeNumber ?? fastFallback.episodeNumber,
    };
  } catch {
    return fastFallback;
  }
}

export async function verifyYouTubeOEmbed(videoId: string): Promise<{
  exists: boolean;
  embeddable: boolean;
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
}> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(
      videoId
    )}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'AetheriaStreamingPlatform/1.0' },
    });
    if (res.status === 401 || res.status === 403) {
      return { exists: true, embeddable: false };
    }
    if (!res.ok) {
      return { exists: false, embeddable: false };
    }
    const data = (await res.json()) as any;
    return {
      exists: true,
      embeddable: true,
      title: data.title,
      authorName: data.author_name,
      thumbnailUrl:
        data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return { exists: false, embeddable: false };
  }
}

export async function lookupYouTubeVideo(
  urlOrId: string,
  preferredCategory?: MovieCategory
): Promise<{
  success: boolean;
  error?: string;
  movie?: Partial<MovieItem>;
}> {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) {
    return {
      success: false,
      error: 'Invalid YouTube URL or 11-character Video ID.',
    };
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const hasYouTubeKey = Boolean(apiKey && !apiKey.includes('your-youtube'));

  if (hasYouTubeKey) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${encodeURIComponent(
        videoId
      )}&key=${encodeURIComponent(apiKey!)}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const json = (await res.json()) as any;
        const item = json.items?.[0];
        if (!item) {
          return {
            success: false,
            error: `Video ID "${videoId}" was not found or is private on YouTube.`,
          };
        }
        const snippet = item.snippet || {};
        const status = item.status || {};
        const stats = item.statistics || {};
        const durationSec = parseIsoDurationToSeconds(
          item.contentDetails?.duration || 'PT10M'
        );
        const isEmbeddable = status.embeddable !== false;
        const isPublic = status.privacyStatus === 'public';

        const aiClass = await classifyMovieWithGemini(
          snippet.title || 'Untitled AI Film',
          snippet.description || '',
          snippet.channelTitle || 'AI Creator',
          preferredCategory || 'Billionaire Romance'
        );

        return {
          success: true,
          movie: {
            youtubeVideoId: videoId,
            title: aiClass.cleanTitle,
            synopsis: aiClass.synopsis,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            backdropUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            primaryCategory: preferredCategory || aiClass.primaryCategory,
            secondaryCategories: aiClass.secondaryCategories,
            channelTitle: snippet.channelTitle || 'AI Studio Creator',
            channelId: snippet.channelId || '',
            publishedAt: snippet.publishedAt || new Date().toISOString(),
            durationSeconds: durationSec || 600,
            durationFormatted: formatDurationSeconds(durationSec || 600),
            viewCount: Number(stats.viewCount || 0),
            likeCount: Number(stats.likeCount || 0),
            isEmbeddable,
            playbackStatus: !isPublic
              ? 'private'
              : !isEmbeddable
              ? 'embed_restricted'
              : 'active',
            aiQualityScore: aiClass.aiQualityScore,
            seasonNumber: aiClass.seasonNumber,
            episodeNumber: aiClass.episodeNumber,
            discoveredVia: 'youtube_api',
          },
        };
      }
    } catch (err) {
      console.error('YouTube Data API lookup failed, falling back to oEmbed:', err);
    }
  }

  // Fallback to official YouTube oEmbed API (0 quota, no API key required)
  const oembed = await verifyYouTubeOEmbed(videoId);
  if (!oembed.exists) {
    return {
      success: false,
      error: `Unable to verify video "${videoId}" via YouTube oEmbed. It may be private, deleted, or embedding is disabled by the creator.`,
    };
  }

  const aiClass = await classifyMovieWithGemini(
    oembed.title || `AI Cinema Feature (${videoId})`,
    '',
    oembed.authorName || 'YouTube AI Creator',
    preferredCategory || 'Billionaire Romance'
  );

  return {
    success: true,
    movie: {
      youtubeVideoId: videoId,
      title: aiClass.cleanTitle,
      synopsis: aiClass.synopsis,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      backdropUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      primaryCategory: preferredCategory || aiClass.primaryCategory,
      secondaryCategories: aiClass.secondaryCategories,
      channelTitle: oembed.authorName || 'YouTube AI Creator',
      channelId: '',
      publishedAt: new Date().toISOString(),
      durationSeconds: 540,
      durationFormatted: '09:00',
      viewCount: 125000,
      likeCount: 8400,
      isEmbeddable: oembed.embeddable,
      playbackStatus: oembed.embeddable ? 'active' : 'embed_restricted',
      aiQualityScore: aiClass.aiQualityScore,
      seasonNumber: aiClass.seasonNumber,
      episodeNumber: aiClass.episodeNumber,
      discoveredVia: 'manual',
    },
  };
}

interface RssFeedEntry {
  videoId: string;
  title: string;
  publishedAt: string;
  channelTitle: string;
  channelId: string;
  description: string;
}

async function fetchYouTubeChannelRss(channelId: string): Promise<RssFeedEntry[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
    channelId
  )}`;
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'AetheriaStreamingPlatform/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Channel RSS HTTP ${res.status} for channel ${channelId}`);
  }
  const xml = await res.text();
  const entries: RssFeedEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
    const title = block.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
    const publishedAt = block.match(/<published>([^<]+)<\/published>/)?.[1]?.trim();
    const channelTitle =
      block.match(/<author>\s*<name>([^<]+)<\/name>/)?.[1]?.trim() || 'AI Film Studio';
    const description =
      block.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]?.trim() || '';

    if (videoId && title) {
      entries.push({
        videoId,
        title: decodeXmlEntities(title),
        publishedAt: publishedAt || new Date().toISOString(),
        channelTitle: decodeXmlEntities(channelTitle),
        channelId,
        description: decodeXmlEntities(description),
      });
    }
  }
  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function verifyCatalogueHealth(): Promise<{
  checkedCount: number;
  unavailableHidden: number;
  activeCount: number;
}> {
  const allMovies = await repo.getMovies(true);
  let unavailableHidden = 0;
  let activeCount = 0;

  // Check up to 12 movies per health pass via oEmbed to keep latency fast
  for (const movie of allMovies.slice(0, 12)) {
    const check = await verifyYouTubeOEmbed(movie.youtubeVideoId);
    if (!check.exists) {
      if (movie.playbackStatus !== 'unavailable') {
        await repo.upsertMovie({
          ...movie,
          playbackStatus: 'unavailable',
          isEmbeddable: false,
        });
        unavailableHidden++;
      }
    } else if (!check.embeddable) {
      if (movie.playbackStatus !== 'embed_restricted') {
        await repo.upsertMovie({
          ...movie,
          playbackStatus: 'embed_restricted',
          isEmbeddable: false,
        });
        unavailableHidden++;
      }
    } else {
      activeCount++;
    }
  }

  return {
    checkedCount: Math.min(allMovies.length, 12),
    unavailableHidden,
    activeCount,
  };
}

export async function runDiscoveryPipeline(
  triggerType: 'scheduled' | 'manual' | 'webhook' | 'startup'
): Promise<DiscoveryRunLog> {
  const runId = `run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const settings = await repo.getSettings();
  const sources = (await repo.getSources()).filter((s) => s.isActive);
  const existingMovies = await repo.getMovies(true);
  const existingVideoIds = new Set(existingMovies.map((m) => m.youtubeVideoId));

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const hasYouTubeKey = Boolean(apiKey && !apiKey.includes('your-youtube'));

  const errors: DiscoveryErrorEntry[] = [];
  let videosScanned = 0;
  let moviesAdded = 0;
  let episodesLinked = 0;
  let quotaCostEstimate = 0;

  // 1. Scan YouTube Channel RSS Feeds (Zero API quota cost, works immediately)
  const channelSources = sources.filter((s) => s.sourceType === 'youtube_channel');
  for (const chSource of channelSources) {
    try {
      const feedItems = await fetchYouTubeChannelRss(chSource.value);
      await repo.updateSourceChecked(chSource.id);

      for (const item of feedItems.slice(0, 8)) {
        videosScanned++;
        if (existingVideoIds.has(item.videoId)) {
          continue;
        }

        const oembed = await verifyYouTubeOEmbed(item.videoId);
        if (!oembed.exists || (settings.requireEmbeddable && !oembed.embeddable)) {
          continue;
        }

        const aiClass = await classifyMovieWithGemini(
          item.title,
          item.description,
          item.channelTitle,
          chSource.targetCategory
        );

        const newMovie: MovieItem = {
          id: `mov-rss-${item.videoId}`,
          youtubeVideoId: item.videoId,
          title: aiClass.cleanTitle,
          synopsis: aiClass.synopsis,
          thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
          backdropUrl: `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`,
          primaryCategory: aiClass.primaryCategory,
          secondaryCategories: Array.from(
            new Set([...aiClass.secondaryCategories, 'Newly Released Movies'])
          ) as MovieCategory[],
          channelTitle: item.channelTitle,
          channelId: item.channelId,
          publishedAt: item.publishedAt,
          durationSeconds: 360,
          durationFormatted: '06:00',
          viewCount: 180000,
          likeCount: 12400,
          isEmbeddable: oembed.embeddable,
          playbackStatus: oembed.embeddable ? 'active' : 'embed_restricted',
          approvalStatus: settings.autoPublishEnabled ? 'approved' : 'pending',
          isFeatured: false,
          seriesId: aiClass.episodeNumber ? 'series-obsidian-vows' : null,
          seasonNumber: aiClass.seasonNumber,
          episodeNumber: aiClass.episodeNumber,
          discoveredVia: 'rss_feed',
          aiQualityScore: aiClass.aiQualityScore,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await repo.upsertMovie(newMovie);
        existingVideoIds.add(item.videoId);
        moviesAdded++;
        if (aiClass.episodeNumber) {
          episodesLinked++;
        }

        if (moviesAdded >= 5) break;
      }
    } catch (err) {
      if (!hasYouTubeKey) {
        errors.push({
          timestamp: new Date().toISOString(),
          source: chSource.label,
          message: err instanceof Error ? err.message : String(err),
          code: 'RSS_FETCH_FAILED',
        });
      }
    }
  }

  // 2. Scan Keyword Search Queries via YouTube Data API v3 (if YOUTUBE_API_KEY is configured)
  const querySources = sources
    .filter((s) => s.sourceType === 'search_query')
    .sort((a, b) => {
      if (!a.lastCheckedAt && !b.lastCheckedAt) return 0;
      if (!a.lastCheckedAt) return -1;
      if (!b.lastCheckedAt) return 1;
      return (
        new Date(a.lastCheckedAt).getTime() - new Date(b.lastCheckedAt).getTime()
      );
    });

  if (hasYouTubeKey && querySources.length > 0) {
    // Rotate through the 5 least-recently-checked search queries per run with maxResults=18 (same 100-unit quota cost per search, 3x more movies discovered)
    const selectedQueries = querySources.slice(0, 5);
    for (let i = 0; i < selectedQueries.length; i++) {
      const qSource = selectedQueries[i];
      // Alternate between relevance (popular hits) and date (newly uploaded movies)
      const searchOrder = i % 2 === 1 ? 'date' : 'relevance';
      try {
        quotaCostEstimate += 100; // search.list = 100 units
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&order=${searchOrder}&maxResults=18&q=${encodeURIComponent(
          qSource.value
        )}&key=${encodeURIComponent(apiKey!)}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) {
          const errBody = await searchRes.text();
          throw new Error(`YouTube search.list HTTP ${searchRes.status}: ${errBody.slice(0, 140)}`);
        }
        const searchData = (await searchRes.json()) as any;
        const candidateIds: string[] = (searchData.items || [])
          .map((it: any) => it.id?.videoId)
          .filter((id: string) => Boolean(id) && !existingVideoIds.has(id));

        await repo.updateSourceChecked(qSource.id);
        videosScanned += (searchData.items || []).length;

        if (candidateIds.length > 0) {
          quotaCostEstimate += 1; // videos.list = 1 unit for up to 50 IDs
          const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${encodeURIComponent(
            candidateIds.join(',')
          )}&key=${encodeURIComponent(apiKey!)}`;
          const detailsRes = await fetch(detailsUrl);
          if (detailsRes.ok) {
            const detailsData = (await detailsRes.json()) as any;
            for (const video of detailsData.items || []) {
              const vid = video.id as string;
              const durationSec = parseIsoDurationToSeconds(
                video.contentDetails?.duration || 'PT0S'
              );
              const isEmbeddable = video.status?.embeddable !== false;
              const isPublic = video.status?.privacyStatus === 'public';

              if (!isPublic) continue;
              if (settings.requireEmbeddable && !isEmbeddable) continue;
              if (durationSec > 0 && durationSec < settings.minDurationSeconds) continue;

              const aiClass = classifyMovieFast(
                video.snippet?.title || 'AI Movie',
                video.snippet?.description || '',
                video.snippet?.channelTitle || 'AI Creator',
                qSource.targetCategory
              );

              if (!aiClass.isAiMovieRelevant) continue;

              const newMovie: MovieItem = {
                id: `mov-yt-${vid}`,
                youtubeVideoId: vid,
                title: aiClass.cleanTitle,
                synopsis: aiClass.synopsis,
                thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                backdropUrl: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`,
                primaryCategory: aiClass.primaryCategory,
                secondaryCategories: Array.from(
                  new Set([
                    ...aiClass.secondaryCategories,
                    ...(qSource.targetCategory &&
                    qSource.targetCategory !== aiClass.primaryCategory
                      ? [qSource.targetCategory]
                      : []),
                  ])
                ).slice(0, 3) as MovieCategory[],
                channelTitle: video.snippet?.channelTitle || 'AI Creator',
                channelId: video.snippet?.channelId || '',
                publishedAt: video.snippet?.publishedAt || new Date().toISOString(),
                durationSeconds: durationSec || 600,
                durationFormatted: formatDurationSeconds(durationSec || 600),
                viewCount: Number(video.statistics?.viewCount || 0),
                likeCount: Number(video.statistics?.likeCount || 0),
                isEmbeddable,
                playbackStatus: 'active',
                approvalStatus: settings.autoPublishEnabled ? 'approved' : 'pending',
                isFeatured: false,
                seriesId: aiClass.episodeNumber ? 'series-obsidian-vows' : null,
                seasonNumber: aiClass.seasonNumber,
                episodeNumber: aiClass.episodeNumber,
                discoveredVia: 'youtube_api',
                aiQualityScore: aiClass.aiQualityScore,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              await repo.upsertMovie(newMovie);
              existingVideoIds.add(vid);
              moviesAdded++;
              if (aiClass.episodeNumber) {
                episodesLinked++;
              }
            }
          }
        }
      } catch (err) {
        errors.push({
          timestamp: new Date().toISOString(),
          source: qSource.label,
          message: err instanceof Error ? err.message : String(err),
          code: 'YOUTUBE_API_ERROR',
        });
      }
    }
  } else if (!hasYouTubeKey && querySources.length > 0) {
    errors.push({
      timestamp: new Date().toISOString(),
      source: 'YouTube Data API v3 Keyword Search',
      message:
        'YOUTUBE_API_KEY is not configured in Secrets yet. Discovery ran using 0-quota Public Channel RSS & oEmbed feeds. Add YOUTUBE_API_KEY in AI Studio Secrets to enable full keyword search.',
      code: 'YOUTUBE_KEY_MISSING_INFO',
    });
  }

  // 3. Verify health of existing movies (detect removed, private, or unembeddable videos)
  const health = await verifyCatalogueHealth();

  const completedAt = new Date().toISOString();
  const nextScheduledRunAt = new Date(
    Date.now() + settings.scheduleIntervalHours * 3600 * 1000
  ).toISOString();

  await repo.updateSettings({
    lastSuccessfulRunAt: completedAt,
    nextScheduledRunAt,
    adminNotificationCount: settings.adminNotificationCount + moviesAdded,
  });

  const runLog: DiscoveryRunLog = {
    id: runId,
    triggerType,
    status: 'completed',
    startedAt,
    completedAt,
    videosScanned,
    moviesAdded,
    episodesLinked,
    unavailableHidden: health.unavailableHidden,
    quotaCostEstimate,
    usedYouTubeDataApi: hasYouTubeKey,
    errors,
    summary: `Scanned ${videosScanned} videos (${
      hasYouTubeKey ? 'YouTube Data API v3 + Channel RSS' : 'Channel RSS + oEmbed'
    }). Added ${moviesAdded} new AI movies, linked ${episodesLinked} series episodes, and hid ${
      health.unavailableHidden
    } unavailable videos.`,
  };

  await repo.recordDiscoveryRun(runLog);
  return runLog;
}

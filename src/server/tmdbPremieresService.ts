import { TmdbPremiereItem, TmdbPremieresResponse } from '../types/cinema.ts';

const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

const PRE_2026_REGEX = /\b(19\d{2}|200\d|201\d|202[0-5])\b/;
const SPAM_REGEX =
  /\b(reaction|reacts|breakdown|explained|gameplay|walkthrough|cutscenes|fan made|concept trailer|ai concept|parody|music video|podcast|#shorts)\b/i;

const TRAILER_COMPILATION_REGEX =
  /\b(movie trailers|upcoming movies|new trailers|all trailers|teaser compilation|concept trailer|fan trailer|trailers\s*202[5-9]|trailers\s*&\s*teasers|top\s*\d+\s*movies|best upcoming)\b/i;

function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildDefaultWatchProviders(title: string): Array<{ name: string; url: string }> {
  const q = encodeURIComponent(title);
  return [
    { name: 'JustWatch', url: `https://www.justwatch.com/us/search?q=${q}` },
    { name: 'Tubi (Free)', url: `https://tubitv.com/search/${q}` },
    { name: 'IMDb', url: `https://www.imdb.com/find/?q=${q}&s=tt` },
  ];
}

async function findSingleYouTubeTrailerId(title: string, year = '2026'): Promise<string | null> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${title} ${year} official trailer`
    )}&hl=en&gl=US`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
        },
      },
      4000
    );
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!m) return null;
    const data = JSON.parse(m[1]);
    let found: string | null = null;
    const walk = (obj: any) => {
      if (!obj || typeof obj !== 'object' || found) return;
      if (obj.videoRenderer) {
        const vr = obj.videoRenderer;
        const vid = String(vr.videoId || '');
        const rawTitle = vr.title?.runs?.map((r: any) => r.text).join('') || '';
        const parts = (vr.lengthText?.simpleText || '').split(':').map(Number);
        const durSec =
          parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts.length === 2
            ? parts[0] * 60 + parts[1]
            : 0;
        if (
          /^[A-Za-z0-9_-]{11}$/.test(vid) &&
          durSec >= 45 &&
          durSec <= 360 &&
          !SPAM_REGEX.test(rawTitle)
        ) {
          found = vid;
        }
        return;
      }
      if (Array.isArray(obj)) {
        for (const el of obj) walk(el);
      } else {
        for (const key of Object.keys(obj)) walk(obj[key]);
      }
    };
    walk(data);
    return found;
  } catch {
    return null;
  }
}

async function verifyYouTubeOEmbedOk(videoId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      {},
      2600
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchYouTube2026FullMovies(
  query: string,
  region: 'global' | 'nollywood',
  limit = 4
): Promise<TmdbPremiereItem[]> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&hl=en&gl=US`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
        },
      },
      5500
    );
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    const rawHits: Array<{
      vid: string;
      title: string;
      chan: string;
      snippet: string;
      publishedText: string;
      durSec: number;
    }> = [];
    const seen = new Set<string>();

    const walk = (obj: any) => {
      if (!obj || typeof obj !== 'object' || rawHits.length >= limit * 3) return;
      if (obj.videoRenderer) {
        const vr = obj.videoRenderer;
        const vid = String(vr.videoId || '');
        if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid) || seen.has(vid)) return;
        const title = vr.title?.runs?.map((r: any) => r.text).join('') || '';
        const chan = vr.ownerText?.runs?.[0]?.text || 'Cinema Premiere 2026';
        const snippet =
          vr.detailedMetadataSnippets?.[0]?.snippetText?.runs
            ?.map((r: any) => r.text)
            .join('') || '';
        const publishedText = String(vr.publishedTimeText?.simpleText || '2026');
        const parts = (vr.lengthText?.simpleText || '').split(':').map(Number);
        const durSec =
          parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts.length === 2
            ? parts[0] * 60 + parts[1]
            : 0;

        if (
          title &&
          durSec >= 2700 &&
          !PRE_2026_REGEX.test(title) &&
          !SPAM_REGEX.test(`${title} ${snippet}`) &&
          !TRAILER_COMPILATION_REGEX.test(`${title} ${snippet}`)
        ) {
          seen.add(vid);
          rawHits.push({
            vid,
            title: title.replace(/\s+/g, ' ').trim(),
            chan,
            snippet,
            publishedText,
            durSec,
          });
        }
        return;
      }
      if (Array.isArray(obj)) {
        for (const el of obj) walk(el);
      } else {
        for (const key of Object.keys(obj)) walk(obj[key]);
      }
    };
    walk(data);

    const verified = await Promise.all(
      rawHits.slice(0, limit + 3).map(async (hit) => {
        const ok = await verifyYouTubeOEmbedOk(hit.vid);
        if (!ok) return null;
        const item: TmdbPremiereItem = {
          id: `yt-full-2026-${hit.vid}`,
          title: hit.title,
          overview:
            hit.snippet.trim() ||
            `Free embed-verified 2026 full-length ${
              region === 'nollywood' ? 'Nollywood' : 'global indie'
            } movie from ${hit.chan}.`,
          releaseDate: hit.publishedText.includes('ago')
            ? `Dropped ${hit.publishedText}`
            : '2026 Release',
          releaseYear: '2026',
          posterUrl: `https://i.ytimg.com/vi/${hit.vid}/hqdefault.jpg`,
          backdropUrl: `https://i.ytimg.com/vi/${hit.vid}/maxresdefault.jpg`,
          rating: 8.3,
          genres: [
            region === 'nollywood' ? 'Nollywood 2026' : 'Free Full Movie',
            'YouTube HD',
          ],
          region,
          sourcePlatform: 'youtube',
          videoId: hit.vid,
          releaseKind: 'full_movie',
          channelTitle: hit.chan,
          durationSeconds: hit.durSec,
          durationFormatted: formatDuration(hit.durSec),
          watchProviders: [
            {
              name: 'Watch on YouTube',
              url: `https://www.youtube.com/watch?v=${encodeURIComponent(hit.vid)}`,
            },
          ],
          sourceMode: 'live_cinema_fallback',
        };
        return item;
      })
    );

    return verified.filter((x): x is TmdbPremiereItem => x !== null).slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchTmdbLive(
  apiKey: string,
  region: 'all' | 'global' | 'nollywood'
): Promise<TmdbPremiereItem[]> {
  const isBearer = apiKey.length > 45;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(isBearer ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  const makeUrl = (pathAndQuery: string) => {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    return isBearer
      ? `https://api.themoviedb.org/3${pathAndQuery}`
      : `https://api.themoviedb.org/3${pathAndQuery}${sep}api_key=${encodeURIComponent(apiKey)}`;
  };

  const today = new Date().toISOString().slice(0, 10);

  const requests: Array<{ region: 'global' | 'nollywood'; url: string }> = [];
  if (region === 'all' || region === 'global') {
    requests.push({
      region: 'global',
      url: makeUrl(
        `/discover/movie?primary_release_year=2026&primary_release_date.lte=${today}&sort_by=popularity.desc&include_adult=false&language=en-US&page=1`
      ),
    });
  }
  if (region === 'all' || region === 'nollywood') {
    requests.push({
      region: 'nollywood',
      url: makeUrl(
        `/discover/movie?primary_release_year=2026&with_origin_country=NG&sort_by=popularity.desc&include_adult=false&language=en-US&page=1`
      ),
    });
  }

  const rawLists = await Promise.all(
    requests.map(async (req) => {
      try {
        const res = await fetchWithTimeout(req.url, { headers }, 5500);
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: any[] };
        return (data.results || []).slice(0, 7).map((m) => ({
          movie: m,
          region: req.region,
        }));
      } catch {
        return [];
      }
    })
  );

  const combined = rawLists.flat();
  const seenTmdb = new Set<number>();
  const uniqueRaw = combined.filter(({ movie }) => {
    if (!movie?.id || !movie?.title || seenTmdb.has(movie.id)) return false;
    seenTmdb.add(movie.id);
    return true;
  });

  const enriched = await Promise.all(
    uniqueRaw.slice(0, 10).map(async ({ movie, region: itemRegion }) => {
      let trailerYoutubeId: string | null = null;
      let providers: Array<{ name: string; url: string }> = buildDefaultWatchProviders(
        movie.title
      );

      try {
        const detailRes = await fetchWithTimeout(
          makeUrl(`/movie/${movie.id}?append_to_response=videos,watch/providers&language=en-US`),
          { headers },
          4000
        );
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as any;
          const vids: any[] = detail?.videos?.results || [];
          const bestTrailer =
            vids.find(
              (v) =>
                v.site === 'YouTube' &&
                v.type === 'Trailer' &&
                v.official === true
            ) ||
            vids.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
            vids.find((v) => v.site === 'YouTube' && v.type === 'Teaser');
          if (bestTrailer?.key) {
            trailerYoutubeId = String(bestTrailer.key);
          }

          const wpResults = detail?.['watch/providers']?.results;
          const localRegion =
            itemRegion === 'nollywood'
              ? wpResults?.NG || wpResults?.US
              : wpResults?.US || wpResults?.GB || wpResults?.NG;
          if (localRegion) {
            const watchLink =
              localRegion.link ||
              `https://www.themoviedb.org/movie/${movie.id}/watch`;
            const list: any[] = [
              ...(localRegion.flatrate || []),
              ...(localRegion.free || []),
              ...(localRegion.ads || []),
              ...(localRegion.rent || []),
            ];
            const uniqueNames = Array.from(
              new Set(list.map((p) => String(p.provider_name || '')).filter(Boolean))
            ).slice(0, 3);
            if (uniqueNames.length > 0) {
              providers = [
                ...uniqueNames.map((name) => ({ name, url: watchLink })),
                {
                  name: 'JustWatch',
                  url: `https://www.justwatch.com/us/search?q=${encodeURIComponent(
                    movie.title
                  )}`,
                },
              ].slice(0, 3);
            } else if (localRegion.link) {
              providers = [
                { name: 'TMDB Watch Guide', url: localRegion.link },
                ...providers.slice(0, 2),
              ];
            }
          }
        }
      } catch {
        // Keep base movie data if detail fetch times out
      }

      if (!trailerYoutubeId) {
        trailerYoutubeId = await findSingleYouTubeTrailerId(
          String(movie.title),
          String(movie.release_date || '2026').slice(0, 4)
        );
      }

      const posterPath = movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : '';
      const backdropPath = movie.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
        : posterPath;

      const genres = Array.isArray(movie.genre_ids)
        ? movie.genre_ids
            .map((gid: number) => TMDB_GENRE_MAP[gid])
            .filter(Boolean)
            .slice(0, 2)
        : [];

      const item: TmdbPremiereItem = {
        id: `tmdb-2026-${movie.id}`,
        tmdbId: Number(movie.id),
        title: String(movie.title),
        overview:
          String(movie.overview || '').trim() ||
          `Official 2026 ${itemRegion === 'nollywood' ? 'Nigerian cinema' : 'global theatrical'} premiere.`,
        releaseDate: String(movie.release_date || '2026'),
        releaseYear: String(movie.release_date || '2026').slice(0, 4),
        posterUrl:
          posterPath ||
          (trailerYoutubeId
            ? `https://i.ytimg.com/vi/${trailerYoutubeId}/hqdefault.jpg`
            : ''),
        backdropUrl:
          backdropPath ||
          (trailerYoutubeId
            ? `https://i.ytimg.com/vi/${trailerYoutubeId}/maxresdefault.jpg`
            : ''),
        rating:
          typeof movie.vote_average === 'number' && movie.vote_average > 0
            ? Math.round(movie.vote_average * 10) / 10
            : 7.4,
        genres: genres.length > 0 ? genres : [itemRegion === 'nollywood' ? 'Nollywood' : '2026 Premiere'],
        region: itemRegion,
        sourcePlatform: 'youtube',
        videoId: trailerYoutubeId,
        releaseKind: 'official_trailer',
        channelTitle: itemRegion === 'nollywood' ? 'Nollywood 2026' : 'TMDB 2026 Premiere',
        durationSeconds: 150,
        durationFormatted: '02:30',
        watchProviders: providers,
        sourceMode: 'tmdb_live',
      };

      return item;
    })
  );

  return enriched.filter((x) => Boolean(x.posterUrl || x.backdropUrl));
}

async function fetchYouTube2026TrailersFallback(
  query: string,
  region: 'global' | 'nollywood',
  limit = 6
): Promise<TmdbPremiereItem[]> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&sp=EgIIBQ%253D%253D&hl=en&gl=US`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
        },
      },
      6000
    );
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    const items: TmdbPremiereItem[] = [];
    const seen = new Set<string>();

    const walk = (obj: any) => {
      if (!obj || typeof obj !== 'object' || items.length >= limit) return;
      if (obj.videoRenderer) {
        const vr = obj.videoRenderer;
        const vid = String(vr.videoId || '');
        if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid) || seen.has(vid)) return;

        const rawTitle = vr.title?.runs?.map((r: any) => r.text).join('') || '';
        const chan = vr.ownerText?.runs?.[0]?.text || 'Official Studio 2026';
        const snippet =
          vr.detailedMetadataSnippets?.[0]?.snippetText?.runs
            ?.map((r: any) => r.text)
            .join('') || '';
        const publishedText = String(vr.publishedTimeText?.simpleText || '2026');
        const parts = (vr.lengthText?.simpleText || '').split(':').map(Number);
        const durSec =
          parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts.length === 2
            ? parts[0] * 60 + parts[1]
            : 140;

        if (
          rawTitle &&
          rawTitle.includes('2026') &&
          !PRE_2026_REGEX.test(rawTitle) &&
          !SPAM_REGEX.test(`${rawTitle} ${snippet}`) &&
          durSec >= 60 &&
          durSec <= 420
        ) {
          seen.add(vid);
          const cleanTitle = rawTitle
            .replace(/\(?\s*2026\s*\)?/gi, '')
            .replace(/\b(official|final|new|hd|4k|movie|film)?\s*(teaser\s*)?trailer(\s*#?\d)?\b/gi, '')
            .replace(/\|\s*.*$/g, '')
            .replace(/[-–—:]\s*$/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const finalTitle = cleanTitle.length >= 3 ? cleanTitle : rawTitle.trim();
          items.push({
            id: `yt-premiere-2026-${vid}`,
            title: finalTitle,
            overview:
              snippet.trim() ||
              `Official 2026 ${region === 'nollywood' ? 'Nollywood' : 'Global Cinema'} release preview from ${chan}.`,
            releaseDate: publishedText.includes('ago') ? `Dropped ${publishedText}` : '2026 Premiere',
            releaseYear: '2026',
            posterUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            backdropUrl: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`,
            rating: region === 'nollywood' ? 8.1 : 7.9,
            genres: [region === 'nollywood' ? 'Nollywood 2026' : '2026 Premiere', 'Official Trailer'],
            region,
            sourcePlatform: 'youtube',
            videoId: vid,
            releaseKind: 'official_trailer',
            channelTitle: chan,
            durationSeconds: durSec,
            durationFormatted: formatDuration(durSec),
            watchProviders: buildDefaultWatchProviders(finalTitle),
            sourceMode: 'live_cinema_fallback',
          });
        }
        return;
      }
      if (Array.isArray(obj)) {
        for (const el of obj) walk(el);
      } else {
        for (const key of Object.keys(obj)) walk(obj[key]);
      }
    };

    walk(data);
    return items;
  } catch {
    return [];
  }
}

async function fetchDailymotion2026DropsFallback(
  query: string,
  region: 'global' | 'nollywood',
  limit = 4
): Promise<TmdbPremiereItem[]> {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(
      query
    )}&fields=id,title,description,duration,thumbnail_720_url,thumbnail_480_url,owner.screenname,created_time,views_total,allow_embed&sort=recent&limit=12&longer_than=40`;
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'TKStoryworld/1.0' } },
      5000
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { list?: any[] };
    const list = Array.isArray(data.list) ? data.list : [];

    const items: TmdbPremiereItem[] = [];
    for (const v of list) {
      if (items.length >= limit) break;
      if (!v?.id || v.allow_embed === false) continue;
      const title = String(v.title || '').trim();
      const dur = Number(v.duration) || 0;
      const createdYear = v.created_time
        ? new Date(Number(v.created_time) * 1000).getUTCFullYear()
        : 2026;
      if (
        !title ||
        dur < 2400 ||
        createdYear < 2026 ||
        PRE_2026_REGEX.test(title) ||
        SPAM_REGEX.test(title) ||
        TRAILER_COMPILATION_REGEX.test(title)
      ) {
        continue;
      }

      const thumb = String(v.thumbnail_720_url || v.thumbnail_480_url || '');
      if (!thumb) continue;

      items.push({
        id: `dm-drop-2026-${v.id}`,
        title,
        overview:
          String(v.description || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220) ||
          `Fresh 2026 full-length movie drop streaming directly on TK STORYWORLD via Dailymotion HD.`,
        releaseDate: v.created_time
          ? new Date(Number(v.created_time) * 1000).toISOString().slice(0, 10)
          : '2026',
        releaseYear: '2026',
        posterUrl: thumb,
        backdropUrl: thumb,
        rating: 8.2,
        genres: [region === 'nollywood' ? 'Nollywood 2026' : 'Full Movie 2026', 'Dailymotion HD'],
        region,
        sourcePlatform: 'dailymotion',
        videoId: String(v.id),
        releaseKind: 'full_movie',
        channelTitle: String(v['owner.screenname'] || 'Dailymotion Cinema'),
        durationSeconds: dur,
        durationFormatted: formatDuration(dur),
        watchProviders: [
          {
            name: 'Dailymotion HD',
            url: `https://www.dailymotion.com/video/${encodeURIComponent(String(v.id))}`,
          },
        ],
        sourceMode: 'live_cinema_fallback',
      });
    }
    return items;
  } catch {
    return [];
  }
}

export async function fetchTmdb2026Premieres(options: {
  apiKey?: string;
  region?: 'all' | 'global' | 'nollywood';
}): Promise<TmdbPremieresResponse> {
  const region = options.region || 'all';
  const apiKey = String(options.apiKey || '').trim();
  const hasTmdbKey = Boolean(apiKey && !apiKey.includes('your-tmdb'));

  // Always pull verified 2026 full-length Nollywood & Dailymotion movies in parallel so Just Dropped 2026 includes REAL full movies, not just trailers
  const freeFullTasks: Array<Promise<TmdbPremiereItem[]>> = [];
  if (region === 'all' || region === 'nollywood') {
    freeFullTasks.push(
      fetchYouTube2026FullMovies('2026 latest nigerian nollywood full movie', 'nollywood', 4)
    );
    freeFullTasks.push(
      fetchDailymotion2026DropsFallback('2026 nigerian nollywood full movie', 'nollywood', 2)
    );
  }
  if (region === 'all' || region === 'global') {
    freeFullTasks.push(
      fetchDailymotion2026DropsFallback('2026 full movie english', 'global', 3)
    );
    freeFullTasks.push(
      fetchYouTube2026FullMovies('2026 full movie english free action', 'global', 2)
    );
  }

  const [tmdbItems, ...fullBatches] = await Promise.all([
    hasTmdbKey ? fetchTmdbLive(apiKey, region) : Promise.resolve([] as TmdbPremiereItem[]),
    ...freeFullTasks,
  ]);

  const full2026Movies = fullBatches.flat();

  let premiereTrailers = tmdbItems;
  if (premiereTrailers.length === 0) {
    const trailerTasks: Array<Promise<TmdbPremiereItem[]>> = [];
    if (region === 'all' || region === 'global') {
      trailerTasks.push(fetchYouTube2026TrailersFallback('2026 official movie trailer hd', 'global', 6));
    }
    if (region === 'all' || region === 'nollywood') {
      trailerTasks.push(
        fetchYouTube2026TrailersFallback('2026 nigerian nollywood movie official trailer', 'nollywood', 5)
      );
    }
    premiereTrailers = (await Promise.all(trailerTasks)).flat();
  }

  // Interleave playable FULL 2026 movies and TMDB 2026 theatrical premieres cleanly
  const interleaved: TmdbPremiereItem[] = [];
  const maxLen = Math.max(full2026Movies.length, premiereTrailers.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < full2026Movies.length) interleaved.push(full2026Movies[i]);
    if (i < premiereTrailers.length) interleaved.push(premiereTrailers[i]);
  }

  const deduped: TmdbPremiereItem[] = [];
  const seenKeys = new Set<string>();
  for (const item of interleaved) {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28);
    if (!norm || seenKeys.has(norm)) continue;
    seenKeys.add(norm);
    deduped.push(item);
  }

  return {
    mode: tmdbItems.length > 0 ? 'tmdb_live' : 'live_cinema_fallback',
    updatedAt: new Date().toISOString(),
    total: deduped.length,
    items: deduped.slice(0, 16),
  };
}

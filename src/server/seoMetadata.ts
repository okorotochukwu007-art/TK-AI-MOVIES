export const DEFAULT_SITE_ORIGIN = 'https://www.tkstoryworld.name.ng';
export const SITE_NAME = 'TK STORYWORLD';
export const DEFAULT_TITLE =
  'TK STORYWORLD — Free Full Movies & 2026 Series Streaming';
export const DEFAULT_DESCRIPTION =
  'Stream free full-length Nollywood hits, Hollywood action blockbusters, emotional dramas, romance, and 2026 trending series in HD on TK STORYWORLD.';
export const DEFAULT_OG_IMAGE =
  'https://www.tkstoryworld.name.ng/og-banner.jpg';

export interface SeoMovieRecord {
  id: string;
  title: string;
  synopsis?: string;
  thumbnailUrl?: string;
  backdropUrl?: string;
  primaryCategory?: string;
  secondaryCategories?: string[];
  channelTitle?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  releaseDate?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  viewCount?: number;
  likeCount?: number;
  sourcePlatform?: 'youtube' | 'dailymotion' | 'vimeo' | string;
  youtubeVideoId?: string;
  externalVideoId?: string;
  seriesId?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface CompactSeoMovieEntry {
  t: string; // title
  sl?: string; // clean URL slug
  s?: string; // synopsis
  img?: string; // backdrop/poster image
  th?: string; // thumbnail image
  cat?: string; // primary category
  cats?: string[]; // secondary categories
  ch?: string; // channel / studio
  pub?: string; // published ISO date
  dur?: number; // duration in seconds
  v?: number; // view count
  p?: string; // platform (youtube | dailymotion | vimeo)
  vid?: string; // raw video id
  ep?: boolean; // is episode
}

export type CompactSeoMovieMap = Record<string, CompactSeoMovieEntry>;

export function cleanPublicCategoryLabel(label?: string): string {
  if (!label) return 'Full Movie';
  const cleaned = String(label)
    .replace(/\bAI[- ]Generated\b/gi, '')
    .replace(/\bAI\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'Full Movie';
}

export function slugifyMovieTitle(title: string): string {
  const raw = String(title || '')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/《([^》]*)》/g, ' $1 ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!raw) return 'watch-movie';
  if (raw.length <= 64) return raw;
  const sliced = raw.slice(0, 64);
  const lastDash = sliced.lastIndexOf('-');
  const trimmed = lastDash > 32 ? sliced.slice(0, lastDash) : sliced;
  return trimmed.replace(/-+$/g, '') || 'watch-movie';
}

export function getMovieShortId(id: string): string {
  const clean = String(id || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  if (!clean) return 'film';
  return clean.slice(-8);
}

export function buildMovieSlug(title: string, id: string): string {
  const base = slugifyMovieTitle(title);
  const token = getMovieShortId(id);
  return `${base}-${token}`;
}

export function buildMoviePath(movie: { id: string; title: string }): string {
  return `/movie/${buildMovieSlug(movie.title, movie.id)}`;
}

export function buildMovieCanonicalUrl(
  movie: { id: string; title: string },
  siteOrigin = DEFAULT_SITE_ORIGIN
): string {
  const origin = siteOrigin.replace(/\/+$/, '');
  return `${origin}${buildMoviePath(movie)}`;
}

export function extractMovieIdentifierFromUrl(
  pathname: string,
  search: string
): { type: 'slug' | 'query'; value: string } | null {
  const cleanPath = String(pathname || '').replace(/\/+$/, '');
  const match = /^\/movie\/([^/]+)$/i.exec(cleanPath);
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]).trim();
      if (decoded) return { type: 'slug', value: decoded };
    } catch {
      const raw = match[1].trim();
      if (raw) return { type: 'slug', value: raw };
    }
  }

  try {
    const params = new URLSearchParams(search || '');
    const queryId = params.get('movie')?.trim();
    if (queryId) {
      return { type: 'query', value: queryId };
    }
  } catch {
    // ignore malformed query string
  }

  return null;
}

export function findMovieByIdentifier<
  T extends {
    id: string;
    title: string;
    youtubeVideoId?: string;
    externalVideoId?: string;
  }
>(movies: T[], identifier: string): T | undefined {
  const needle = String(identifier || '').trim();
  if (!needle) return undefined;
  const lower = needle.toLowerCase();

  // 1. Direct exact ID or video ID match
  const direct = movies.find(
    (m) =>
      m.id === needle ||
      m.youtubeVideoId === needle ||
      m.externalVideoId === needle
  );
  if (direct) return direct;

  // 2. Exact generated slug match
  const exactSlug = movies.find(
    (m) => buildMovieSlug(m.title, m.id).toLowerCase() === lower
  );
  if (exactSlug) return exactSlug;

  // 3. Trailing 8-char ID token match (resilient if a movie title is ever edited)
  const tokenMatch = /-([a-z0-9]{6,12})$/i.exec(lower);
  if (tokenMatch && tokenMatch[1]) {
    const token = tokenMatch[1].toLowerCase();
    const byToken = movies.find(
      (m) => getMovieShortId(m.id).toLowerCase() === token
    );
    if (byToken) return byToken;
  }

  // 4. Exact title-only slug match (if someone visits /movie/<title-without-id>)
  const byTitleSlug = movies.find(
    (m) => slugifyMovieTitle(m.title).toLowerCase() === lower
  );
  if (byTitleSlug) return byTitleSlug;

  return undefined;
}

export function findCompactSeoMovieByIdentifier(
  seoMap: CompactSeoMovieMap,
  identifier: string
): { id: string; entry: CompactSeoMovieEntry } | null {
  const needle = String(identifier || '').trim();
  if (!needle) return null;

  // 1. Direct ID lookup
  if (seoMap[needle]) {
    return { id: needle, entry: seoMap[needle] };
  }

  const lower = needle.toLowerCase();
  const entries = Object.entries(seoMap);

  // 2. Exact slug match (precomputed or dynamic)
  for (const [id, entry] of entries) {
    const slug = (entry.sl || buildMovieSlug(entry.t, id)).toLowerCase();
    if (slug === lower) {
      return { id, entry };
    }
  }

  // 3. Trailing short-ID token match
  const tokenMatch = /-([a-z0-9]{6,12})$/i.exec(lower);
  if (tokenMatch && tokenMatch[1]) {
    const token = tokenMatch[1].toLowerCase();
    for (const [id, entry] of entries) {
      if (getMovieShortId(id) === token) {
        return { id, entry };
      }
    }
  }

  // 4. Fallback video ID or title-only slug match
  for (const [id, entry] of entries) {
    if (entry.vid === needle || slugifyMovieTitle(entry.t) === lower) {
      return { id, entry };
    }
  }

  return null;
}

export function expandCompactSeoMovie(
  id: string,
  entry: CompactSeoMovieEntry
): SeoMovieRecord {
  return {
    id,
    title: entry.t,
    synopsis: entry.s,
    backdropUrl: entry.img || entry.th,
    thumbnailUrl: entry.th || entry.img,
    primaryCategory: entry.cat,
    secondaryCategories: entry.cats,
    channelTitle: entry.ch,
    publishedAt: entry.pub,
    durationSeconds: entry.dur,
    viewCount: entry.v,
    sourcePlatform: entry.p || 'youtube',
    externalVideoId: entry.vid,
    youtubeVideoId: entry.vid,
    seriesId: entry.ep ? 'series' : null,
  };
}

export function escapeHtmlAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtmlText(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function serializeJsonLd(data: unknown): string {
  // Prevent closing </script> injection or HTML comment breakage inside JSON-LD
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function toIsoDuration(seconds?: number): string | undefined {
  const total = Math.floor(Number(seconds) || 0);
  if (total <= 0) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  let iso = 'PT';
  if (h > 0) iso += `${h}H`;
  if (m > 0) iso += `${m}M`;
  if (s > 0 || (h === 0 && m === 0)) iso += `${s}S`;
  return iso;
}

function toIsoDateTime(raw?: string): string {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLen: number): string {
  const cleaned = cleanWhitespace(text);
  if (cleaned.length <= maxLen) return cleaned;
  const sliced = cleaned.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > maxLen * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[,;:\-–—\s]+$/, '')}…`;
}

function resolveRawVideoId(movie: SeoMovieRecord): {
  platform: 'youtube' | 'dailymotion' | 'vimeo' | 'archive';
  videoId: string;
} | null {
  const raw = (movie.externalVideoId || movie.youtubeVideoId || '').trim();
  if (!raw) return null;

  if (raw.startsWith('dm:')) {
    return { platform: 'dailymotion', videoId: raw.slice(3) };
  }
  if (raw.startsWith('vm:')) {
    return { platform: 'vimeo', videoId: raw.slice(3) };
  }
  if (raw.startsWith('ia:')) {
    return { platform: 'archive', videoId: raw.slice(3) };
  }

  const platform =
    movie.sourcePlatform === 'dailymotion' ||
    movie.sourcePlatform === 'vimeo' ||
    movie.sourcePlatform === 'archive'
      ? movie.sourcePlatform
      : 'youtube';

  return { platform, videoId: raw };
}

function resolveEmbedUrl(movie: SeoMovieRecord): string | undefined {
  const resolved = resolveRawVideoId(movie);
  if (!resolved || !resolved.videoId) return undefined;
  if (resolved.platform === 'dailymotion') {
    return `https://geo.dailymotion.com/player.html?video=${encodeURIComponent(resolved.videoId)}`;
  }
  if (resolved.platform === 'vimeo') {
    return `https://player.vimeo.com/video/${encodeURIComponent(resolved.videoId)}`;
  }
  if (resolved.platform === 'archive') {
    return `https://archive.org/embed/${encodeURIComponent(resolved.videoId)}`;
  }
  return `https://www.youtube.com/embed/${encodeURIComponent(resolved.videoId)}`;
}

export interface MovieSeoPayload {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: 'video.movie' | 'video.episode';
  imageUrl: string;
  thumbnailUrls: string[];
  jsonLd: Record<string, unknown>;
}

export function buildMovieSeoPayload(
  movie: SeoMovieRecord,
  siteOrigin = DEFAULT_SITE_ORIGIN
): MovieSeoPayload {
  const origin = siteOrigin.replace(/\/+$/, '');
  const cleanTitle = cleanWhitespace(movie.title || 'Featured Full Movie');
  const shortTitle = truncateText(cleanTitle, 64);
  const title = `${shortTitle} | ${SITE_NAME}`;

  const rawSynopsis = cleanWhitespace(movie.synopsis || '');
  const category = cleanPublicCategoryLabel(movie.primaryCategory);
  const durationLabel = movie.durationSeconds
    ? `${Math.max(1, Math.round(movie.durationSeconds / 60))} min`
    : '';
  const suffixParts = [category, durationLabel].filter(Boolean).join(' · ');
  const fallbackDesc = `Watch ${cleanTitle} (${suffixParts || 'Full HD Movie'}) free online on ${SITE_NAME}. Stream full-length Nollywood, Hollywood, and trending 2026 films in HD.`;

  const baseDesc =
    rawSynopsis.length >= 45
      ? `${rawSynopsis} Watch free in HD on ${SITE_NAME}.`
      : fallbackDesc;
  const description = truncateText(baseDesc, 158);

  const canonicalUrl = buildMovieCanonicalUrl(
    { id: movie.id, title: cleanTitle },
    origin
  );
  const isEpisode = Boolean(
    movie.seriesId ||
      (movie.seasonNumber && movie.seasonNumber > 0) ||
      (movie.episodeNumber && movie.episodeNumber > 0)
  );
  const ogType: 'video.movie' | 'video.episode' = isEpisode
    ? 'video.episode'
    : 'video.movie';

  const primaryImage =
    movie.backdropUrl || movie.thumbnailUrl || DEFAULT_OG_IMAGE;
  const thumbnailUrls = Array.from(
    new Set(
      [movie.backdropUrl, movie.thumbnailUrl, DEFAULT_OG_IMAGE].filter(
        (u): u is string => Boolean(u && /^https?:\/\//i.test(u))
      )
    )
  );

  const uploadDate = toIsoDateTime(
    movie.publishedAt || movie.releaseDate || movie.createdAt || movie.updatedAt
  );
  const datePublished = uploadDate.slice(0, 10);
  const isoDuration = toIsoDuration(movie.durationSeconds);
  const embedUrl = resolveEmbedUrl(movie);

  const genres = Array.from(
    new Set(
      [movie.primaryCategory, ...(movie.secondaryCategories || [])]
        .filter((g): g is string => Boolean(g && g.trim()))
        .map((g) => cleanPublicCategoryLabel(g))
        .filter(Boolean)
    )
  );

  const viewCount = Number(movie.viewCount) || 0;
  const interactionStatistic =
    viewCount > 0
      ? {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'WatchAction' },
          userInteractionCount: viewCount,
        }
      : undefined;

  const movieNode: Record<string, unknown> = {
    '@type': isEpisode ? 'TVEpisode' : 'Movie',
    '@id': `${canonicalUrl}#movie`,
    name: cleanTitle,
    description: truncateText(rawSynopsis || fallbackDesc, 300),
    url: canonicalUrl,
    image: thumbnailUrls,
    datePublished,
    inLanguage: 'en',
    isAccessibleForFree: true,
    ...(isoDuration ? { duration: isoDuration } : {}),
    ...(genres.length > 0 ? { genre: genres } : {}),
    ...(movie.channelTitle
      ? {
          productionCompany: {
            '@type': 'Organization',
            name: cleanWhitespace(movie.channelTitle),
          },
        }
      : {}),
    ...(interactionStatistic ? { interactionStatistic } : {}),
    potentialAction: {
      '@type': 'WatchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: canonicalUrl,
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    },
  };

  const videoNode: Record<string, unknown> = {
    '@type': 'VideoObject',
    '@id': `${canonicalUrl}#video`,
    name: cleanTitle,
    description: truncateText(rawSynopsis || fallbackDesc, 300),
    thumbnailUrl: thumbnailUrls,
    uploadDate,
    ...(isoDuration ? { duration: isoDuration } : {}),
    ...(embedUrl ? { embedUrl } : {}),
    contentUrl: canonicalUrl,
    isFamilyFriendly: true,
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${origin}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${origin}/pwa-512x512.png`,
      },
    },
    ...(interactionStatistic ? { interactionStatistic } : {}),
  };

  const breadcrumbNode: Record<string, unknown> = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: `${origin}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: category,
        item: `${origin}/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: cleanTitle,
        item: canonicalUrl,
      },
    ],
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [movieNode, videoNode, breadcrumbNode],
  };

  return {
    title,
    description,
    canonicalUrl,
    ogType,
    imageUrl: primaryImage,
    thumbnailUrls,
    jsonLd,
  };
}

function replaceMetaByName(html: string, name: string, content: string): string {
  const escaped = escapeHtmlAttr(content);
  const regex = new RegExp(
    `<meta\\s+name=["']${name}["']\\s+content=["'][^"']*["']\\s*\\/?>`,
    'i'
  );
  if (regex.test(html)) {
    return html.replace(regex, `<meta name="${name}" content="${escaped}" />`);
  }
  return html.replace(
    '</head>',
    `    <meta name="${name}" content="${escaped}" />\n  </head>`
  );
}

function replaceMetaByProperty(
  html: string,
  property: string,
  content: string
): string {
  const escaped = escapeHtmlAttr(content);
  const regex = new RegExp(
    `<meta\\s+property=["']${property}["']\\s+content=["'][^"']*["']\\s*\\/?>`,
    'i'
  );
  if (regex.test(html)) {
    return html.replace(
      regex,
      `<meta property="${property}" content="${escaped}" />`
    );
  }
  return html.replace(
    '</head>',
    `    <meta property="${property}" content="${escaped}" />\n  </head>`
  );
}

function replaceCanonicalLink(html: string, canonicalUrl: string): string {
  const escaped = escapeHtmlAttr(canonicalUrl);
  const regex = /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i;
  if (regex.test(html)) {
    return html.replace(regex, `<link rel="canonical" href="${escaped}" />`);
  }
  return html.replace(
    '</head>',
    `    <link rel="canonical" href="${escaped}" />\n  </head>`
  );
}

export function injectMovieSeoIntoHtml(
  html: string,
  movie: SeoMovieRecord,
  siteOrigin = DEFAULT_SITE_ORIGIN
): string {
  const payload = buildMovieSeoPayload(movie, siteOrigin);
  let out = html;

  // 1. <title>
  const escapedTitle = escapeHtmlText(payload.title);
  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);
  } else {
    out = out.replace('</head>', `    <title>${escapedTitle}</title>\n  </head>`);
  }

  // 2. Meta description + Canonical
  out = replaceMetaByName(out, 'description', payload.description);
  out = replaceCanonicalLink(out, payload.canonicalUrl);

  // 3. OpenGraph tags
  out = replaceMetaByProperty(out, 'og:title', payload.title);
  out = replaceMetaByProperty(out, 'og:description', payload.description);
  out = replaceMetaByProperty(out, 'og:type', payload.ogType);
  out = replaceMetaByProperty(out, 'og:url', payload.canonicalUrl);
  out = replaceMetaByProperty(out, 'og:image', payload.imageUrl);
  out = replaceMetaByProperty(out, 'og:image:alt', payload.title);

  // 4. Twitter tags
  out = replaceMetaByName(out, 'twitter:title', payload.title);
  out = replaceMetaByName(out, 'twitter:description', payload.description);
  out = replaceMetaByName(out, 'twitter:image', payload.imageUrl);

  // 5. Replace JSON-LD structured data with Movie + VideoObject + BreadcrumbList graph
  const jsonLdScript = `<script type="application/ld+json" id="tk-seo-jsonld">${serializeJsonLd(payload.jsonLd)}</script>`;
  if (/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(out)) {
    out = out.replace(
      /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,
      jsonLdScript
    );
  } else {
    out = out.replace('</head>', `    ${jsonLdScript}\n  </head>`);
  }

  // 6. Add non-intrusive <noscript> crawlable fallback outside #root so non-JS bots see title & synopsis
  const noscriptSnippet = `<noscript><main><h1>${escapeHtmlText(movie.title)}</h1><p>${escapeHtmlText(payload.description)}</p><p><a href="${escapeHtmlAttr(payload.canonicalUrl)}">Watch ${escapeHtmlText(movie.title)} on ${SITE_NAME}</a></p></main></noscript>`;
  if (out.includes('<div id="root"></div>')) {
    out = out.replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscriptSnippet}`);
  }

  return out;
}

export interface SeoCategoryPageConfig {
  slug: string; // e.g. 'nollywood'
  path: string; // e.g. '/nollywood'
  label: string; // short nav/footer label
  heading: string; // crawlable H1
  title: string; // <title> & og:title
  description: string; // 125-158 char meta description
  view: 'nigerian' | 'series' | 'categories';
  categoryKey: string; // 'All Categories' or MovieCategory
  matchMode: 'nollywood' | 'series' | 'category' | 'all';
}

export const SEO_CATEGORY_PAGES: SeoCategoryPageConfig[] = [
  {
    slug: 'nollywood',
    path: '/nollywood',
    label: 'Nollywood Movies',
    heading: 'Watch Free 2026 Nollywood & Nigerian Movies Online',
    title: 'Watch Free 2026 Nollywood & Nigerian Movies Online | TK STORYWORLD',
    description:
      'Stream free full-length 2026 Nollywood movies, Lagos billionaire romance, royal African epics, and Nigerian love dramas in HD on TK STORYWORLD.',
    view: 'nigerian',
    categoryKey: 'All Categories',
    matchMode: 'nollywood',
  },
  {
    slug: '2026-series',
    path: '/2026-series',
    label: '2026 Series',
    heading: 'Watch Free 2026 Series & Full Episodes Online',
    title: 'Watch Free 2026 Series & Full Episodes Online | TK STORYWORLD',
    description:
      'Binge-watch complete 2026 Nollywood series, K-Dramas, crime thrillers, and multi-episode limited series free in HD on TK STORYWORLD.',
    view: 'series',
    categoryKey: 'All Categories',
    matchMode: 'series',
  },
  {
    slug: 'action-movies',
    path: '/action-movies',
    label: 'Action Movies',
    heading: 'Watch Free 2026 Action Movies Full HD Online',
    title: 'Watch Free 2026 Action Movies Full HD Online | TK STORYWORLD',
    description:
      'Stream full-length 2026 Hollywood action blockbusters, high-speed thrillers, martial arts, and spy missions free in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Action Movies',
    matchMode: 'category',
  },
  {
    slug: 'new-movies',
    path: '/new-movies',
    label: 'New 2026 Movies',
    heading: 'Watch Free New 2026 Full Movies Online in HD',
    title: 'Watch Free New 2026 Full Movies Online in HD | TK STORYWORLD',
    description:
      'Discover the newest 2026 full-length movies added daily — Hollywood blockbusters, trending Nollywood premieres, and viral dramas free on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'New Movies',
    matchMode: 'category',
  },
  {
    slug: 'trending-movies',
    path: '/trending-movies',
    label: 'Trending Movies',
    heading: 'Trending 2026 Full Movies — Watch Free Online',
    title: 'Trending 2026 Full Movies — Watch Free Online | TK STORYWORLD',
    description:
      'Watch the most popular trending 2026 full movies ranked by millions of viewers. Stream top action, romance, and drama hits free in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Trending AI Movies',
    matchMode: 'category',
  },
  {
    slug: 'billionaire-romance',
    path: '/billionaire-romance',
    label: 'Billionaire Romance',
    heading: 'Free Billionaire Romance Full Movies Online',
    title: 'Free Billionaire Romance Full Movies Online | TK STORYWORLD',
    description:
      'Watch captivating billionaire romance full movies featuring secret heirs, undercover tycoons, and sweeping love stories free in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Billionaire Romance',
    matchMode: 'category',
  },
  {
    slug: 'ceo-love-stories',
    path: '/ceo-love-stories',
    label: 'CEO Love Stories',
    heading: 'Free CEO Love Stories & Office Romance Movies',
    title: 'Free CEO Love Stories & Office Romance Movies | TK STORYWORLD',
    description:
      'Stream full-length CEO love stories, powerhouse romance dramas, and unforgettable second-chance love movies free in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'CEO Love Stories',
    matchMode: 'category',
  },
  {
    slug: 'contract-marriage',
    path: '/contract-marriage',
    label: 'Contract Marriage',
    heading: 'Watch Contract Marriage Romance Full Movies Free',
    title: 'Watch Contract Marriage Romance Full Movies Free | TK STORYWORLD',
    description:
      'Watch free contract marriage and arranged-love full movies packed with hidden identities, heartfelt twists, and happy endings on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Contract Marriage',
    matchMode: 'category',
  },
  {
    slug: 'revenge-romance',
    path: '/revenge-romance',
    label: 'Revenge Romance',
    heading: 'Revenge Romance & Rebirth Full Movies Free Online',
    title: 'Revenge Romance & Rebirth Full Movies Free Online | TK STORYWORLD',
    description:
      'Stream dramatic revenge romance, betrayal, and triumphant comeback full movies free in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Revenge Romance',
    matchMode: 'category',
  },
  {
    slug: 'emotional-love-stories',
    path: '/emotional-love-stories',
    label: 'Emotional Love Stories',
    heading: 'Emotional Love Stories & Heartfelt Drama Movies Free',
    title: 'Emotional Love Stories & Heartfelt Drama Movies Free | TK STORYWORLD',
    description:
      'Watch deeply moving emotional love stories, family dramas, and tear-jerking romantic full movies free online in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Emotional Love Stories',
    matchMode: 'category',
  },
  {
    slug: 'fantasy-romance',
    path: '/fantasy-romance',
    label: 'Fantasy Romance',
    heading: 'Fantasy Romance & Royal Folktale Full Movies Free',
    title: 'Fantasy Romance & Royal Folktale Full Movies Free | TK STORYWORLD',
    description:
      'Explore enchanted fantasy romance movies, royal palace dramas, and mystical love stories streaming free in HD on TK STORYWORLD.',
    view: 'categories',
    categoryKey: 'Fantasy Romance',
    matchMode: 'category',
  },
  {
    slug: 'categories',
    path: '/categories',
    label: 'All Genres',
    heading: 'Browse All Free Movie Genres & 2026 Categories',
    title: 'Browse All Free Movie Genres & 2026 Categories | TK STORYWORLD',
    description:
      'Explore every movie genre on TK STORYWORLD — Nollywood, Hollywood action, 2026 series, billionaire romance, emotional dramas, and more free in HD.',
    view: 'categories',
    categoryKey: 'All Categories',
    matchMode: 'all',
  },
];

const NOLLYWOOD_SEO_REGEX =
  /\b(nollywood|nigerian|nigeria|african|africa|lagos|abuja|lekki|yoruba|igbo|hausa|ghana|ghanaian|naira|oba|igwe|royal palace|ruth kadiri|uchenna mbunabo|bimbo ademoye|maurice sam|clinton joshua|ebube obio|sonia uche|officiall|koleoso)\b/i;

export function findSeoCategoryPageByPath(
  pathname: string
): SeoCategoryPageConfig | undefined {
  const normalized = String(pathname || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');
  if (!normalized || normalized === '/') return undefined;
  return SEO_CATEGORY_PAGES.find((p) => p.path === normalized);
}

export function findSeoCategoryPageByView(
  activeView: string,
  selectedCategory: string
): SeoCategoryPageConfig | undefined {
  if (activeView === 'nigerian') {
    return SEO_CATEGORY_PAGES.find((p) => p.slug === 'nollywood');
  }
  if (activeView === 'series') {
    return SEO_CATEGORY_PAGES.find((p) => p.slug === '2026-series');
  }
  if (activeView === 'categories') {
    const exact = SEO_CATEGORY_PAGES.find(
      (p) => p.view === 'categories' && p.categoryKey === selectedCategory
    );
    return exact || SEO_CATEGORY_PAGES.find((p) => p.slug === 'categories');
  }
  return undefined;
}

export function filterMoviesForSeoCategory(
  movies: SeoMovieRecord[],
  config: SeoCategoryPageConfig
): SeoMovieRecord[] {
  let matched: SeoMovieRecord[];

  if (config.matchMode === 'nollywood') {
    matched = movies.filter((m) => {
      const blob = `${m.title || ''} ${m.synopsis || ''} ${m.channelTitle || ''} ${m.primaryCategory || ''}`;
      return NOLLYWOOD_SEO_REGEX.test(blob);
    });
  } else if (config.matchMode === 'series') {
    matched = movies.filter(
      (m) =>
        Boolean(m.seriesId) ||
        m.primaryCategory === '2026 Series Movies' ||
        m.primaryCategory === 'Complete AI Movie Series' ||
        (m.secondaryCategories || []).includes('2026 Series Movies') ||
        /\b(s0?\d+\s*e0?\d+|episode\s*\d+|season\s*\d+|series)\b/i.test(m.title || '')
    );
  } else if (config.matchMode === 'category') {
    if (config.categoryKey === 'Trending AI Movies') {
      matched = [...movies];
    } else {
      matched = movies.filter(
        (m) =>
          m.primaryCategory === config.categoryKey ||
          (m.secondaryCategories || []).includes(config.categoryKey)
      );
    }
  } else {
    matched = [...movies];
  }

  if (matched.length === 0) {
    matched = [...movies];
  }

  return matched.sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0));
}

export interface CategorySeoPayload {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  jsonLd: Record<string, unknown>;
  topMovies: SeoMovieRecord[];
}

export function buildCategorySeoPayload(
  config: SeoCategoryPageConfig,
  allMovies: SeoMovieRecord[],
  siteOrigin = DEFAULT_SITE_ORIGIN
): CategorySeoPayload {
  const origin = siteOrigin.replace(/\/+$/, '');
  const canonicalUrl = `${origin}${config.path}`;
  const topMovies = filterMoviesForSeoCategory(allMovies, config).slice(0, 20);

  const collectionNode: Record<string, unknown> = {
    '@type': 'CollectionPage',
    '@id': `${canonicalUrl}#collection`,
    name: config.heading,
    description: config.description,
    url: canonicalUrl,
    inLanguage: 'en',
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${origin}/`,
    },
    mainEntity: {
      '@id': `${canonicalUrl}#itemlist`,
    },
  };

  const itemListNode: Record<string, unknown> = {
    '@type': 'ItemList',
    '@id': `${canonicalUrl}#itemlist`,
    name: config.heading,
    numberOfItems: topMovies.length,
    itemListElement: topMovies.map((m, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: buildMovieCanonicalUrl({ id: m.id, title: m.title }, origin),
      item: {
        '@type': m.seriesId ? 'TVEpisode' : 'Movie',
        name: cleanWhitespace(m.title),
        url: buildMovieCanonicalUrl({ id: m.id, title: m.title }, origin),
        image: m.backdropUrl || m.thumbnailUrl || DEFAULT_OG_IMAGE,
      },
    })),
  };

  const breadcrumbNode: Record<string, unknown> = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: `${origin}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: config.label,
        item: canonicalUrl,
      },
    ],
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [collectionNode, itemListNode, breadcrumbNode],
  };

  return {
    title: config.title,
    description: config.description,
    canonicalUrl,
    imageUrl: DEFAULT_OG_IMAGE,
    jsonLd,
    topMovies,
  };
}

export function injectCategorySeoIntoHtml(
  html: string,
  config: SeoCategoryPageConfig,
  allMovies: SeoMovieRecord[],
  siteOrigin = DEFAULT_SITE_ORIGIN
): string {
  const payload = buildCategorySeoPayload(config, allMovies, siteOrigin);
  const origin = siteOrigin.replace(/\/+$/, '');
  let out = html;

  // 1. <title>
  const escapedTitle = escapeHtmlText(payload.title);
  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);
  } else {
    out = out.replace('</head>', `    <title>${escapedTitle}</title>\n  </head>`);
  }

  // 2. Meta description + Canonical
  out = replaceMetaByName(out, 'description', payload.description);
  out = replaceCanonicalLink(out, payload.canonicalUrl);

  // 3. OpenGraph tags
  out = replaceMetaByProperty(out, 'og:title', payload.title);
  out = replaceMetaByProperty(out, 'og:description', payload.description);
  out = replaceMetaByProperty(out, 'og:type', 'website');
  out = replaceMetaByProperty(out, 'og:url', payload.canonicalUrl);
  out = replaceMetaByProperty(out, 'og:image', payload.imageUrl);
  out = replaceMetaByProperty(out, 'og:image:alt', payload.title);

  // 4. Twitter tags
  out = replaceMetaByName(out, 'twitter:title', payload.title);
  out = replaceMetaByName(out, 'twitter:description', payload.description);
  out = replaceMetaByName(out, 'twitter:image', payload.imageUrl);

  // 5. Replace JSON-LD structured data with CollectionPage + ItemList + BreadcrumbList graph
  const jsonLdScript = `<script type="application/ld+json" id="tk-seo-jsonld">${serializeJsonLd(payload.jsonLd)}</script>`;
  if (/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(out)) {
    out = out.replace(
      /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,
      jsonLdScript
    );
  } else {
    out = out.replace('</head>', `    ${jsonLdScript}\n  </head>`);
  }

  // 6. Crawlable <noscript> hub listing top movies in this category + sibling category links
  const movieLinksHtml = payload.topMovies
    .slice(0, 16)
    .map((m) => {
      const href = buildMovieCanonicalUrl({ id: m.id, title: m.title }, origin);
      return `<li><a href="${escapeHtmlAttr(href)}">${escapeHtmlText(m.title)}</a></li>`;
    })
    .join('');

  const siblingLinksHtml = SEO_CATEGORY_PAGES.filter((p) => p.slug !== config.slug)
    .map(
      (p) =>
        `<a href="${escapeHtmlAttr(`${origin}${p.path}`)}">${escapeHtmlText(p.label)}</a>`
    )
    .join(' · ');

  const noscriptSnippet = `<noscript><main><h1>${escapeHtmlText(config.heading)}</h1><p>${escapeHtmlText(config.description)}</p><ul>${movieLinksHtml}</ul><nav>${siblingLinksHtml}</nav></main></noscript>`;
  if (out.includes('<div id="root"></div>')) {
    out = out.replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscriptSnippet}`);
  }

  return out;
}


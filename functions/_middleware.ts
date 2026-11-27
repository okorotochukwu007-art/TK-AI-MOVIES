import {
  CompactSeoMovieMap,
  DEFAULT_SITE_ORIGIN,
  expandCompactSeoMovie,
  extractMovieIdentifierFromUrl,
  findCompactSeoMovieByIdentifier,
  findSeoCategoryPageByPath,
  injectCategorySeoIntoHtml,
  injectMovieSeoIntoHtml,
} from '../src/server/seoMetadata.ts';

interface CloudflarePagesMiddlewareContext {
  request: Request;
  env: {
    ASSETS?: {
      fetch: (input: Request | string | URL) => Promise<Response>;
    };
    APP_URL?: string;
    CANONICAL_SITE_ORIGIN?: string;
    [key: string]: unknown;
  };
  next: () => Promise<Response>;
}

let cachedSeoMap: CompactSeoMovieMap | null = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadSeoMovieMap(
  context: CloudflarePagesMiddlewareContext,
  origin: string
): Promise<CompactSeoMovieMap | null> {
  const now = Date.now();
  if (cachedSeoMap && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedSeoMap;
  }

  if (!context.env?.ASSETS?.fetch) {
    return cachedSeoMap;
  }

  try {
    const assetUrl = new URL('/seo-movies.json', origin);
    const res = await context.env.ASSETS.fetch(new Request(assetUrl.toString()));
    if (!res.ok) return cachedSeoMap;
    const data = (await res.json()) as CompactSeoMovieMap;
    if (data && typeof data === 'object') {
      cachedSeoMap = data;
      cachedAtMs = now;
    }
  } catch {
    // Gracefully fall back to existing cache or default HTML
  }

  return cachedSeoMap;
}

async function fetchIndexHtmlResponse(
  context: CloudflarePagesMiddlewareContext,
  origin: string
): Promise<Response> {
  if (context.env?.ASSETS?.fetch) {
    const indexUrl = new URL('/index.html', origin);
    const assetRes = await context.env.ASSETS.fetch(
      new Request(indexUrl.toString())
    );
    if (assetRes.ok) {
      return assetRes;
    }
  }
  return context.next();
}

export const onRequest = async (
  context: CloudflarePagesMiddlewareContext
): Promise<Response> => {
  const { request } = context;

  // Fast pass-through for non-GET/HEAD requests
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return context.next();
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Fast pass-through for API routes, static assets, sitemap, robots, IndexNow key, and SEO index
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/seo-movies.json' ||
    pathname === '/og-banner.jpg' ||
    pathname.endsWith('.txt')
  ) {
    return context.next();
  }

  const canonicalOrigin = (
    (typeof context.env?.CANONICAL_SITE_ORIGIN === 'string' &&
      context.env.CANONICAL_SITE_ORIGIN.trim()) ||
    DEFAULT_SITE_ORIGIN
  ).replace(/\/+$/, '');

  // 1. SEO Category Landing Pages (e.g. /nollywood, /action-movies, /2026-series)
  const categoryPage = findSeoCategoryPageByPath(pathname);
  if (categoryPage) {
    const response = await fetchIndexHtmlResponse(context, url.origin);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('text/html')) {
      return response;
    }
    try {
      const html = await response.text();
      const seoMap = await loadSeoMovieMap(context, url.origin);
      const movies = seoMap
        ? Object.entries(seoMap).map(([id, entry]) =>
            expandCompactSeoMovie(id, entry)
          )
        : [];
      const enrichedHtml = injectCategorySeoIntoHtml(
        html,
        categoryPage,
        movies,
        canonicalOrigin
      );

      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
      headers.set('X-SEO-Category-Injected', '1');
      headers.delete('Content-Length');

      return new Response(request.method === 'HEAD' ? null : enrichedHtml, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    } catch {
      return response;
    }
  }

  // 2. Per-Movie SEO Injection (/movie/<slug> and legacy /?movie=<id>)
  const isCleanMovieRoute = /^\/movie\/[^/]+\/?$/i.test(pathname);
  const isRootRoute = pathname === '/' || pathname === '/index.html';

  if (!isCleanMovieRoute && !isRootRoute) {
    return context.next();
  }

  const extracted = extractMovieIdentifierFromUrl(pathname, url.search);
  if (!extracted) {
    return context.next();
  }

  const response = isCleanMovieRoute
    ? await fetchIndexHtmlResponse(context, url.origin)
    : await context.next();

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) {
    return response;
  }

  try {
    const seoMap = await loadSeoMovieMap(context, url.origin);
    if (!seoMap) return response;

    const matched = findCompactSeoMovieByIdentifier(seoMap, extracted.value);
    if (!matched) {
      return response;
    }

    const html = await response.text();
    const movieRecord = expandCompactSeoMovie(matched.id, matched.entry);
    const enrichedHtml = injectMovieSeoIntoHtml(html, movieRecord, canonicalOrigin);

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
    headers.set('X-SEO-Movie-Injected', '1');
    headers.delete('Content-Length');

    return new Response(request.method === 'HEAD' ? null : enrichedHtml, {
      status: 200,
      statusText: 'OK',
      headers,
    });
  } catch {
    return response;
  }
};

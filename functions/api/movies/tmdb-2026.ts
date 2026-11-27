import { fetchTmdb2026Premieres } from '../../../src/server/tmdbPremieresService.ts';

interface CloudflarePagesContext {
  request: Request;
  env: Record<string, string | undefined>;
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=600',
};

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet = async (context: CloudflarePagesContext) => {
  try {
    const url = new URL(context.request.url);
    const rawRegion = (url.searchParams.get('region') || 'all').toLowerCase();
    const region: 'all' | 'global' | 'nollywood' =
      rawRegion === 'global' || rawRegion === 'nollywood' ? rawRegion : 'all';

    const apiKey =
      context.env?.TMDB_API_KEY ||
      context.env?.VITE_TMDB_API_KEY ||
      '';

    const payload = await fetchTmdb2026Premieres({ apiKey, region });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        mode: 'live_cinema_fallback',
        updatedAt: new Date().toISOString(),
        total: 0,
        items: [],
        error: error?.message || 'Failed to load 2026 premieres',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

import { resolveTmdbMovieTrailer } from '../../../src/server/multiSourceSearchHelpers';

interface Env {
  TMDB_API_KEY?: string;
  VITE_TMDB_API_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const title = (url.searchParams.get('title') || '').trim();
    const year = (url.searchParams.get('year') || '').trim();
    const rawId = url.searchParams.get('tmdbId');
    const tmdbId = rawId ? Number(rawId) : undefined;

    if (!title && !tmdbId) {
      return new Response(
        JSON.stringify({ error: 'title or tmdbId is required' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await resolveTmdbMovieTrailer({
      tmdbId: Number.isFinite(tmdbId) ? tmdbId : undefined,
      title,
      year,
      apiKey: env?.TMDB_API_KEY || env?.VITE_TMDB_API_KEY || '',
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        videoId: null,
        watchProviders: [],
        error: err?.message || 'Unable to resolve trailer right now',
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

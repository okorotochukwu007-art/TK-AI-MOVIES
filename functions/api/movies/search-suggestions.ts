import {
  buildLocalSearchSuggestions,
  detectNonMovieQuery,
  findTypoCorrection,
  normalizeSearchText,
} from '../../../src/utils/smartMovieSearch';
import { searchTmdbMovieSuggestions } from '../../../src/server/multiSourceSearchHelpers';
import { SearchSuggestionItem } from '../../../src/types/cinema';

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
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2 || detectNonMovieQuery(q).isNonMovie) {
      return new Response(JSON.stringify({ query: q, suggestions: [] }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    const local = buildLocalSearchSuggestions(q, []);
    const typo = findTypoCorrection(q);
    const tmdbTerm = typo?.kind === 'movie_title' ? typo.corrected : q;
    const tmdbApiKey = env?.TMDB_API_KEY || env?.VITE_TMDB_API_KEY || '';
    const tmdbItems = await searchTmdbMovieSuggestions({
      query: tmdbTerm,
      apiKey: tmdbApiKey,
    });

    const merged: SearchSuggestionItem[] = [];
    const seen = new Set<string>();
    const push = (item: SearchSuggestionItem) => {
      const key = normalizeSearchText(item.text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    };

    for (const s of local.filter((x) => x.kind !== 'movie_title')) push(s);
    for (const s of tmdbItems) push(s);
    for (const s of local) push(s);

    return new Response(
      JSON.stringify({ query: q, suggestions: merged.slice(0, 10) }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        query: '',
        suggestions: [],
        error: err?.message || 'Unable to load search suggestions',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  }
};

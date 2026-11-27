import type { MovieItem, WatchProgressItem } from '../types/cinema.ts';

export interface LocalWatchEntry {
  progress: WatchProgressItem;
  movie: MovieItem;
}

const WATCH_HISTORY_STORAGE_KEY = 'tk_storyworld_watch_history_v2';
const AUTOPLAY_NEXT_STORAGE_KEY = 'tk_storyworld_autoplay_next_v1';
const MAX_STORED_WATCH_ENTRIES = 30;

type WatchHistoryStoreMap = Record<string, LocalWatchEntry[]>;

function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readStoreMap(): WatchHistoryStoreMap {
  if (!isStorageAvailable()) return {};
  try {
    const raw = window.localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as WatchHistoryStoreMap;
  } catch {
    return {};
  }
}

function writeStoreMap(map: WatchHistoryStoreMap): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

/**
 * Compacts a MovieItem before persisting in localStorage so even 30 external Smart Search
 * movies stay tiny (< 25 KB total) while preserving everything needed for instant resume playback.
 */
function compactMovieSnapshot(movie: MovieItem): MovieItem {
  return {
    ...movie,
    synopsis: (movie.synopsis || '').slice(0, 260),
  };
}

export function loadLocalWatchEntries(userId: string): LocalWatchEntry[] {
  const key = userId || 'guest';
  const map = readStoreMap();
  const entries = Array.isArray(map[key]) ? map[key] : [];
  return entries
    .filter(
      (entry): entry is LocalWatchEntry =>
        Boolean(entry && entry.progress && entry.movie && entry.movie.id && entry.movie.youtubeVideoId)
    )
    .sort(
      (a, b) =>
        new Date(b.progress.lastWatchedAt || 0).getTime() -
        new Date(a.progress.lastWatchedAt || 0).getTime()
    )
    .slice(0, MAX_STORED_WATCH_ENTRIES);
}

export function saveLocalWatchEntries(userId: string, entries: LocalWatchEntry[]): void {
  const key = userId || 'guest';
  const map = readStoreMap();
  map[key] = entries.slice(0, MAX_STORED_WATCH_ENTRIES);
  writeStoreMap(map);
}

export function upsertLocalWatchEntry(
  userId: string,
  movie: MovieItem,
  progressSeconds: number,
  durationSeconds: number
): LocalWatchEntry[] {
  const safeProg = Math.max(0, Math.floor(Number(progressSeconds) || 0));
  const fallbackDur = movie.durationSeconds && movie.durationSeconds > 60 ? movie.durationSeconds : 5400;
  const safeDur = Math.max(60, Math.floor(Number(durationSeconds) || fallbackDur));
  const completed = safeDur > 0 && safeProg / safeDur >= 0.93;

  const nextEntry: LocalWatchEntry = {
    progress: {
      userId: userId || 'guest',
      movieId: movie.id,
      progressSeconds: Math.min(safeProg, safeDur),
      durationSeconds: safeDur,
      completed,
      lastWatchedAt: new Date().toISOString(),
    },
    movie: compactMovieSnapshot(movie),
  };

  const existing = loadLocalWatchEntries(userId);
  const filtered = existing.filter(
    (item) =>
      item.progress.movieId !== movie.id &&
      item.movie.youtubeVideoId !== movie.youtubeVideoId
  );
  const updated = [nextEntry, ...filtered].slice(0, MAX_STORED_WATCH_ENTRIES);
  saveLocalWatchEntries(userId, updated);
  return updated;
}

export function removeLocalWatchEntry(userId: string, movieId: string): LocalWatchEntry[] {
  const existing = loadLocalWatchEntries(userId);
  const updated = existing.filter((item) => item.progress.movieId !== movieId);
  saveLocalWatchEntries(userId, updated);
  return updated;
}

export function clearLocalWatchEntries(userId: string): void {
  saveLocalWatchEntries(userId, []);
}

export function mergeWatchHistoryWithServer(
  localEntries: LocalWatchEntry[],
  serverHistory: WatchProgressItem[],
  catalogMovies: MovieItem[]
): LocalWatchEntry[] {
  const catalogById = new Map<string, MovieItem>();
  for (const m of catalogMovies) {
    catalogById.set(m.id, m);
  }

  const mergedByMovieId = new Map<string, LocalWatchEntry>();

  for (const entry of localEntries) {
    const freshMovie = catalogById.get(entry.progress.movieId) || entry.movie;
    mergedByMovieId.set(entry.progress.movieId, {
      progress: entry.progress,
      movie: freshMovie,
    });
  }

  for (const serverItem of serverHistory) {
    const existing = mergedByMovieId.get(serverItem.movieId);
    const catalogMovie = catalogById.get(serverItem.movieId) || existing?.movie;
    if (!catalogMovie) continue;

    if (!existing) {
      mergedByMovieId.set(serverItem.movieId, {
        progress: serverItem,
        movie: catalogMovie,
      });
    } else {
      const serverTs = new Date(serverItem.lastWatchedAt || 0).getTime();
      const localTs = new Date(existing.progress.lastWatchedAt || 0).getTime();
      if (serverTs > localTs) {
        mergedByMovieId.set(serverItem.movieId, {
          progress: serverItem,
          movie: catalogMovie,
        });
      }
    }
  }

  return Array.from(mergedByMovieId.values())
    .sort(
      (a, b) =>
        new Date(b.progress.lastWatchedAt || 0).getTime() -
        new Date(a.progress.lastWatchedAt || 0).getTime()
    )
    .slice(0, MAX_STORED_WATCH_ENTRIES);
}

export function getAutoPlayNextPreference(): boolean {
  if (!isStorageAvailable()) return true;
  try {
    const raw = window.localStorage.getItem(AUTOPLAY_NEXT_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setAutoPlayNextPreference(enabled: boolean): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(AUTOPLAY_NEXT_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function formatRemainingTimeLabel(
  progressSeconds: number,
  durationSeconds: number
): string {
  const safeDur = Math.max(1, durationSeconds || 5400);
  const remainingSec = Math.max(0, safeDur - Math.max(0, progressSeconds));
  const totalMins = Math.ceil(remainingSec / 60);
  if (totalMins <= 1) return '1m left';
  if (totalMins < 60) return `${totalMins}m left`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m left` : `${hrs}h left`;
}

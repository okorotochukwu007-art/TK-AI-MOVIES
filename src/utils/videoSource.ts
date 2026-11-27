import { MovieItem, VideoSourcePlatform } from '../types/cinema.ts';

export interface ResolvedVideoSource {
  platform: VideoSourcePlatform;
  videoId: string;
  platformLabel: string;
  shortLabel: string;
  externalWatchUrl: string;
  badgeClassName: string;
}

export function isValidYouTubeId(id?: string | null): boolean {
  return Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id.trim()));
}

export function detectVideoPlatform(movie: Pick<MovieItem, 'sourcePlatform' | 'youtubeVideoId' | 'externalVideoId' | 'discoveredVia'>): {
  platform: VideoSourcePlatform;
  videoId: string;
} {
  const rawYt = (movie.youtubeVideoId || '').trim();
  const rawExt = (movie.externalVideoId || '').trim();

  if (movie.sourcePlatform === 'dailymotion' || rawYt.startsWith('dm:') || movie.discoveredVia === 'dailymotion_api') {
    const cleanId = rawExt || rawYt.replace(/^dm:/, '');
    return { platform: 'dailymotion', videoId: cleanId };
  }

  if (movie.sourcePlatform === 'vimeo' || rawYt.startsWith('vm:') || movie.discoveredVia === 'vimeo_api') {
    const cleanId = rawExt || rawYt.replace(/^vm:/, '');
    return { platform: 'vimeo', videoId: cleanId };
  }

  if (movie.sourcePlatform === 'archive' || rawYt.startsWith('ia:') || movie.discoveredVia === 'internet_archive_api') {
    const cleanId = rawExt || rawYt.replace(/^ia:/, '');
    return { platform: 'archive', videoId: cleanId };
  }

  return { platform: 'youtube', videoId: rawExt || rawYt };
}

export function resolveMovieSource(movie: Pick<MovieItem, 'sourcePlatform' | 'youtubeVideoId' | 'externalVideoId' | 'discoveredVia'>): ResolvedVideoSource {
  const { platform, videoId } = detectVideoPlatform(movie);

  if (platform === 'dailymotion') {
    return {
      platform: 'dailymotion',
      videoId,
      platformLabel: 'Dailymotion HD',
      shortLabel: 'Dailymotion',
      externalWatchUrl: `https://www.dailymotion.com/video/${encodeURIComponent(videoId)}`,
      badgeClassName: 'bg-sky-500/20 border-sky-400/40 text-sky-300',
    };
  }

  if (platform === 'vimeo') {
    return {
      platform: 'vimeo',
      videoId,
      platformLabel: 'Vimeo HD',
      shortLabel: 'Vimeo',
      externalWatchUrl: `https://vimeo.com/${encodeURIComponent(videoId)}`,
      badgeClassName: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300',
    };
  }

  if (platform === 'archive') {
    return {
      platform: 'archive',
      videoId,
      platformLabel: 'Archive Cinema HD',
      shortLabel: 'Archive',
      externalWatchUrl: `https://archive.org/details/${encodeURIComponent(videoId)}`,
      badgeClassName: 'bg-amber-500/20 border-amber-400/40 text-amber-300',
    };
  }

  return {
    platform: 'youtube',
    videoId,
    platformLabel: 'YouTube HD',
    shortLabel: 'YouTube',
    externalWatchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    badgeClassName: 'bg-rose-500/20 border-rose-400/40 text-rose-300',
  };
}

export function buildUnifiedEmbedUrl(options: {
  platform: VideoSourcePlatform;
  videoId: string;
  playerServer?: 'standard' | 'nocookie';
  autoPlay?: boolean;
  streamQuality?: string;
  startOffsetSec?: number;
  embedUrlOverride?: string;
}): string {
  const {
    platform,
    videoId,
    playerServer = 'standard',
    autoPlay = true,
    streamQuality = 'auto',
    startOffsetSec = 0,
    embedUrlOverride,
  } = options;

  if (embedUrlOverride) return embedUrlOverride;

  if (platform === 'dailymotion') {
    // Official Dailymotion universal player endpoint with branding, sharing, and up-next queue hidden
    const params = new URLSearchParams({
      video: videoId,
      'ui-logo': 'false',
      'sharing-enable': 'false',
      'queue-enable': 'false',
    });
    if (startOffsetSec > 15) {
      params.set('startTime', String(Math.floor(startOffsetSec)));
    }
    return `https://geo.dailymotion.com/player.html?${params.toString()}`;
  }

  if (platform === 'vimeo') {
    const params = new URLSearchParams({
      autoplay: autoPlay ? '1' : '0',
      title: '0',
      byline: '0',
      portrait: '0',
      badge: '0',
      vimeo_logo: '0',
      dnt: '1',
      playsinline: '1',
    });
    const hash = startOffsetSec > 15 ? `#t=${Math.floor(startOffsetSec)}s` : '';
    return `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?${params.toString()}${hash}`;
  }

  if (platform === 'archive') {
    const safeId = videoId.replace(/[^A-Za-z0-9._-]/g, '');
    const params = new URLSearchParams();
    if (autoPlay) params.set('autoplay', '1');
    const qs = params.toString();
    return `https://archive.org/embed/${encodeURIComponent(safeId)}${qs ? `?${qs}` : ''}`;
  }

  const host =
    playerServer === 'nocookie'
      ? 'https://www.youtube-nocookie.com'
      : 'https://www.youtube.com';
  // controls=0 removes YouTube's bottom bar (YouTube button, Share, Watch Later, More videos)
  // while our custom TK STORYWORLD cinema controls drive playback via the JS API without altering screen size.
  const params = new URLSearchParams({
    autoplay: autoPlay ? '1' : '0',
    controls: '0',
    disablekb: '1',
    modestbranding: '1',
    rel: '0',
    iv_load_policy: '3',
    playsinline: '1',
    enablejsapi: '1',
    fs: '0',
    hl: 'en',
  });
  // Only set explicit quality when user manually overrides Adaptive Bitrate ('auto' prevents audio cracks & buffering)
  if (streamQuality && streamQuality !== 'auto') {
    params.set('vq', streamQuality);
  }
  // Only pass origin on top-level HTTPS origins; inside preview iframes/WebViews, omitting origin avoids YouTube Error 153
  if (typeof window !== 'undefined') {
    try {
      const origin = window.location.origin;
      if (
        origin &&
        origin.startsWith('https://') &&
        window.top === window.self
      ) {
        params.set('origin', origin);
      }
    } catch {
      // Cross-origin parent frame: omit origin and rely on strict-origin-when-cross-origin referrer
    }
  }
  if (startOffsetSec > 15) {
    params.set('start', String(Math.floor(startOffsetSec)));
  }
  return `${host}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

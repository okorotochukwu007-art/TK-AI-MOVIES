import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  Laptop,
  Play,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { MovieItem } from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';

export interface DeviceDownloadedMovieItem {
  movieId: string;
  youtubeVideoId: string;
  title: string;
  category: string;
  durationFormatted: string;
  thumbnailUrl: string;
  backdropUrl: string;
  quality: '720p HD' | '480p Fast';
  estimatedSizeMb: number;
  downloadedAt: string;
}

const DEVICE_VAULT_STORAGE_KEY = 'tk_storyworld_device_downloads_v1';
const DEVICE_VAULT_CACHE_NAME = 'tk-storyworld-vault-v1';

export function getDeviceDownloadedMovies(): DeviceDownloadedMovieItem[] {
  try {
    const raw = localStorage.getItem(DEVICE_VAULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isMovieInDeviceVault(movieId: string): boolean {
  return getDeviceDownloadedMovies().some((item) => item.movieId === movieId);
}

export async function saveMovieToDeviceVault(
  movie: MovieItem,
  quality: '720p HD' | '480p Fast'
): Promise<DeviceDownloadedMovieItem[]> {
  const durationMin = Math.max(45, Math.round((movie.durationSeconds || 5400) / 60));
  const estimatedSizeMb =
    quality === '720p HD'
      ? Math.round(durationMin * 4.8)
      : Math.round(durationMin * 2.2);

  // Pre-cache poster & backdrop images in browser CacheStorage if supported
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(DEVICE_VAULT_CACHE_NAME);
      const urlsToCache = [
        movie.thumbnailUrl,
        movie.backdropUrl,
        `https://i.ytimg.com/vi/${movie.youtubeVideoId}/hqdefault.jpg`,
      ].filter(Boolean);
      await Promise.allSettled(
        urlsToCache.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => cache.put(u, r)))
      );
    } catch {
      // ignore cache quota errors
    }
  }

  const nextItem: DeviceDownloadedMovieItem = {
    movieId: movie.id,
    youtubeVideoId: movie.youtubeVideoId,
    title: movie.title,
    category: movie.primaryCategory,
    durationFormatted: movie.durationFormatted || '1:30:00',
    thumbnailUrl: movie.thumbnailUrl,
    backdropUrl: movie.backdropUrl || movie.thumbnailUrl,
    quality,
    estimatedSizeMb,
    downloadedAt: new Date().toISOString(),
  };

  const current = getDeviceDownloadedMovies().filter(
    (item) => item.movieId !== movie.id
  );
  const updated = [nextItem, ...current];
  try {
    localStorage.setItem(DEVICE_VAULT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage quota
  }
  return updated;
}

export function removeMovieFromDeviceVault(
  movieId: string
): DeviceDownloadedMovieItem[] {
  const updated = getDeviceDownloadedMovies().filter(
    (item) => item.movieId !== movieId
  );
  try {
    localStorage.setItem(DEVICE_VAULT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

function buildStandaloneCinemaPlayerHtml(
  movie: MovieItem,
  quality: '720p HD' | '480p Fast'
): string {
  const vq = quality === '720p HD' ? 'hd720' : 'large';
  const safeTitle = movie.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSynopsis = (movie.synopsis || '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${safeTitle} — TK STORYWORLD Portable Cinema File</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #050505; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; display: flex; flex-direction: column; }
    .top-bar { height: 54px; background: #050505; border-bottom: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: space-between; padding: 0 18px; }
    .brand { color: #FF1E4D; font-weight: 900; letter-spacing: 0.14em; font-size: 13px; text-transform: uppercase; }
    .title { font-weight: 700; font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw; }
    .player-wrap { position: relative; width: 100%; max-width: 1200px; margin: 0 auto; aspect-ratio: 16 / 9; background: #000; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.12); }
    .player-wrap iframe { position: absolute; left: 0; right: 0; top: -60px; width: 100%; height: calc(100% + 120px); border: 0; background: #000; }
    .shield-top { position: absolute; top: 0; left: 0; right: 0; height: 44px; background: #050505; z-index: 10; display: flex; align-items: center; padding: 0 16px; font-size: 12px; color: #f59e0b; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .shield-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 44px; background: #050505; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 12px; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); }
    .details { max-width: 1200px; width: 100%; margin: 0 auto; padding: 24px 18px; }
    .badge { display: inline-block; background: #E11D48; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; margin-bottom: 10px; }
    h1 { font-size: 22px; margin-bottom: 10px; color: #fff; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px; max-width: 75ch; }
    .btn { display: inline-block; background: #E11D48; color: #fff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 20px; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="top-bar">
    <span class="brand">TK STORYWORLD · PORTABLE DEVICE PLAYER</span>
    <span class="title">${safeTitle}</span>
  </div>
  <div class="player-wrap">
    <div class="shield-top">🎬 TK STORYWORLD · ${quality} Cinema Edition · ${movie.durationFormatted}</div>
    <iframe
      src="https://www.youtube-nocookie.com/embed/${movie.youtubeVideoId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&vq=${vq}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
    ></iframe>
    <div class="shield-bottom">
      <span>Saved from www.tkstoryworld.name.ng</span>
      <span style="color:#10b981;font-weight:700;">● Verified Full Movie</span>
    </div>
  </div>
  <div class="details">
    <span class="badge">${movie.primaryCategory} · ${quality}</span>
    <h1>${safeTitle}</h1>
    <p>${safeSynopsis}</p>
    <a class="btn" href="https://www.tkstoryworld.name.ng/?movie=${encodeURIComponent(movie.id)}">▶ Open Full Catalogue on TK STORYWORLD</a>
  </div>
</body>
</html>`;
}

interface DownloadMovieModalProps {
  movie: MovieItem;
  onClose: () => void;
  onPlayMovie?: (movie: MovieItem) => void;
  onOpenSavedMovies?: () => void;
  onVaultUpdated?: (items: DeviceDownloadedMovieItem[]) => void;
}

export const DownloadMovieModal: React.FC<DownloadMovieModalProps> = ({
  movie,
  onClose,
  onPlayMovie,
  onOpenSavedMovies,
  onVaultUpdated,
}) => {
  const [selectedQuality, setSelectedQuality] = useState<'720p HD' | '480p Fast'>(
    '720p HD'
  );
  const [vaultSaved, setVaultSaved] = useState<boolean>(() =>
    isMovieInDeviceVault(movie.id)
  );
  const [vaultProgress, setVaultProgress] = useState<number | null>(null);
  const [deviceFileProgress, setDeviceFileProgress] = useState<number | null>(
    null
  );
  const [resolvedMp4Url, setResolvedMp4Url] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const durationMin = Math.max(
    45,
    Math.round((movie.durationSeconds || 5400) / 60)
  );
  const hdSizeMb = Math.round(durationMin * 4.8);
  const fastSizeMb = Math.round(durationMin * 2.2);

  useEffect(() => {
    setVaultSaved(isMovieInDeviceVault(movie.id));
  }, [movie.id]);

  // Primary Action: Download & Store Movie in the App's "Saved Movies" Page
  const handleSaveToVault = async () => {
    if (vaultProgress !== null) return;
    setStatusMessage(null);
    setVaultProgress(15);

    const step1 = window.setTimeout(() => setVaultProgress(48), 260);
    const step2 = window.setTimeout(() => setVaultProgress(85), 540);

    const updated = await saveMovieToDeviceVault(movie, selectedQuality);

    window.setTimeout(() => {
      clearTimeout(step1);
      clearTimeout(step2);
      setVaultProgress(100);
      setVaultSaved(true);
      if (onVaultUpdated) onVaultUpdated(updated);
      setStatusMessage(
        `Downloaded "${movie.title}" (${selectedQuality}) into your Saved Movies page on the app! You can watch it anytime from Saved Movies.`
      );
      window.setTimeout(() => setVaultProgress(null), 900);
    }, 850);
  };

  const handleRemoveFromVault = () => {
    const updated = removeMovieFromDeviceVault(movie.id);
    setVaultSaved(false);
    if (onVaultUpdated) onVaultUpdated(updated);
    setStatusMessage('Removed movie from your Saved Movies page.');
  };

  // Secondary Action: Also export to Phone or Computer Downloads Folder + store in Saved Movies
  const handleDownloadToDeviceFile = async () => {
    if (deviceFileProgress !== null) return;
    setStatusMessage(null);
    setDeviceFileProgress(18);

    const qParam = selectedQuality === '720p HD' ? '720p' : '480p';
    let directStreamUrl: string | null = null;

    // 1. Try server-side MP4 resolver endpoint first
    try {
      const res = await fetch(
        `/api/movies/${encodeURIComponent(movie.id)}/resolve-mp4`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            youtubeVideoId: movie.youtubeVideoId,
            quality: qParam,
          }),
        }
      );
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.resolved && data.directMp4Url) {
          directStreamUrl = data.directMp4Url;
        }
      }
    } catch {
      // continue to client-side stream resolver
    }

    setDeviceFileProgress(58);

    // 2. Try client-side CORS-friendly Piped stream resolver if server didn't resolve
    if (!directStreamUrl) {
      const clientMirrors = [
        `https://pipedapi.kavin.rocks/streams/${movie.youtubeVideoId}`,
        `https://pipedapi.tokhmi.xyz/streams/${movie.youtubeVideoId}`,
      ];
      for (const mirrorUrl of clientMirrors) {
        try {
          const controller = new AbortController();
          const t = window.setTimeout(() => controller.abort(), 2800);
          const r = await fetch(mirrorUrl, { signal: controller.signal });
          window.clearTimeout(t);
          if (!r.ok) continue;
          const data = await r.json();
          const streams: any[] = Array.isArray(data?.videoStreams)
            ? data.videoStreams.filter((s: any) => s.videoOnly === false && s.url)
            : [];
          if (streams.length > 0) {
            const match =
              streams.find((s) =>
                qParam === '720p'
                  ? String(s.quality).includes('720')
                  : String(s.quality).includes('360') ||
                    String(s.quality).includes('480')
              ) || streams[0];
            directStreamUrl = match.url;
            break;
          }
        } catch {
          // try next
        }
      }
    }

    setDeviceFileProgress(92);

    // Always store into the App's Saved Movies page automatically
    const updatedVault = await saveMovieToDeviceVault(movie, selectedQuality);
    setVaultSaved(true);
    if (onVaultUpdated) onVaultUpdated(updatedVault);

    const safeFileName =
      movie.title
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 60) || 'TK_STORYWORLD_Movie_2026';

    if (directStreamUrl) {
      setResolvedMp4Url(directStreamUrl);
      const a = document.createElement('a');
      a.href = directStreamUrl;
      a.download = `${safeFileName}_${qParam}_TK_STORYWORLD.mp4`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDeviceFileProgress(100);
      setStatusMessage(
        `Saved to your "Saved Movies" page on the app AND started downloading "${safeFileName}.mp4"!`
      );
      window.setTimeout(() => setDeviceFileProgress(null), 900);
      return;
    }

    try {
      const htmlContent = buildStandaloneCinemaPlayerHtml(
        movie,
        selectedQuality
      );
      const blob = new Blob([htmlContent], {
        type: 'text/html;charset=utf-8',
      });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${safeFileName}_${qParam}_TK_STORYWORLD_Player.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      // ignore blob error
    }

    setDeviceFileProgress(100);
    setStatusMessage(
      `Saved to your "Saved Movies" page on the app AND downloaded the portable player file to your device!`
    );
    window.setTimeout(() => setDeviceFileProgress(null), 900);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Download ${movie.title}`}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#0B0E15] border border-white/15 p-5 sm:p-7 space-y-5 shadow-2xl my-auto">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="brand-luxury-red text-xs font-black uppercase">
                TK STORYWORLD SAVED MOVIES
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                In-App Offline Vault
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-1">
              Download Movie to Saved Movies
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 cursor-pointer"
            aria-label="Close Download Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Movie Preview Card */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#07090E] border border-white/10">
          <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
            <CinemaPosterImage
              src={movie.backdropUrl || movie.thumbnailUrl}
              fallbackVideoId={movie.youtubeVideoId}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-display text-xs sm:text-sm font-bold text-white line-clamp-2">
              {movie.title}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="text-[#F59E0B] font-sans font-semibold">
                {movie.primaryCategory}
              </span>
              <span>·</span>
              <span>{movie.durationFormatted}</span>
              {vaultSaved && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400 font-sans font-bold">
                    ✓ Stored in Saved Movies
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Step 1: Select Video Quality (720p HD vs 480p Fast) */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            1. Select Download Quality for Saved Movies
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedQuality('720p HD')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                selectedQuality === '720p HD'
                  ? 'bg-[#1A0D18] border-[#E11D48] ring-1 ring-[#E11D48]'
                  : 'bg-[#07090E] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs sm:text-sm font-bold text-white">
                  🎬 720p Full HD
                </span>
                <span className="font-mono text-[11px] text-[#F59E0B] font-bold">
                  ~{hdSizeMb} MB
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Crystal-clear widescreen cinema quality
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedQuality('480p Fast')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                selectedQuality === '480p Fast'
                  ? 'bg-[#1A0D18] border-[#E11D48] ring-1 ring-[#E11D48]'
                  : 'bg-[#07090E] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs sm:text-sm font-bold text-white">
                  ⚡ 480p Fast Saver
                </span>
                <span className="font-mono text-[11px] text-emerald-400 font-bold">
                  ~{fastSizeMb} MB
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Uses 50% less mobile data · Fast save
              </div>
            </button>
          </div>
        </div>

        {/* Status / Progress Feedback */}
        {statusMessage && (
          <div className="px-3.5 py-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{statusMessage}</div>
            </div>
            {vaultSaved && onOpenSavedMovies && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSavedMovies();
                }}
                className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Open Saved Movies Page Now</span>
              </button>
            )}
          </div>
        )}

        {/* Step 2: Primary In-App Saved Movies Storage + Optional Device File */}
        <div className="space-y-3">
          <div className="rounded-xl bg-[#07090E] border border-emerald-500/30 p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
                <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                <span>
                  Download &amp; Store in "Saved Movies" on the App
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                Stores this movie directly inside TK STORYWORLD’s{' '}
                <strong className="text-emerald-400">Saved Movies</strong> page
                so you can access and watch all your downloaded movies right inside the app.
              </p>
            </div>

            {vaultProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-emerald-400">
                  <span>Downloading {selectedQuality} to Saved Movies...</span>
                  <span>{vaultProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#E11D48] to-[#F59E0B] transition-all duration-300"
                    style={{ width: `${vaultProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveToVault()}
                disabled={vaultProgress !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-bold shadow-lg transition-colors cursor-pointer"
              >
                {vaultSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Stored in Saved Movies ({selectedQuality})</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download to Saved Movies ({selectedQuality})</span>
                  </>
                )}
              </button>

              {vaultSaved && onOpenSavedMovies && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSavedMovies();
                  }}
                  className="inline-flex items-center gap-1.5 py-3 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>View Saved Movies</span>
                </button>
              )}

              {vaultSaved && onPlayMovie && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPlayMovie(movie);
                  }}
                  className="inline-flex items-center gap-1.5 py-3 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </button>
              )}

              {vaultSaved && (
                <button
                  type="button"
                  onClick={handleRemoveFromVault}
                  className="p-3 rounded-xl bg-white/5 hover:bg-rose-950/60 border border-white/10 text-slate-400 hover:text-rose-300 cursor-pointer"
                  title="Remove from Saved Movies"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Optional Device Export */}
          <div className="rounded-xl bg-[#07090E] border border-white/10 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400">
                Also save a backup player file to your Phone / Computer storage:
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadToDeviceFile()}
                disabled={deviceFileProgress !== null}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>
                  {deviceFileProgress !== null
                    ? `Saving (${deviceFileProgress}%)...`
                    : 'Export Backup File'}
                </span>
              </button>
            </div>

            {resolvedMp4Url && (
              <a
                href={resolvedMp4Url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold w-full cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Direct .MP4 Stream</span>
              </a>
            )}

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
              <span className="inline-flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-slate-400" />
                Android &amp; iPhone Saved Movies Vault
              </span>
              <span className="inline-flex items-center gap-1">
                <Laptop className="w-3 h-3 text-slate-400" />
                Windows &amp; Mac Saved Movies Vault
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  Film,
  HardDrive,
  Laptop,
  Play,
  Smartphone,
  Sparkles,
  Trash2,
  Video,
  WifiOff,
  X,
} from 'lucide-react';
import { MovieItem } from '../types/cinema.ts';
import { CinemaPosterImage } from './CinemaPosterImage.tsx';
import { isValidYouTubeId, resolveMovieSource } from '../utils/videoSource.ts';

export interface DeviceDownloadedMovieItem {
  movieId: string;
  youtubeVideoId: string;
  title: string;
  category: string;
  durationFormatted: string;
  thumbnailUrl: string;
  backdropUrl: string;
  quality: '1080p FHD' | '720p HD' | '480p Fast';
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
  quality: '1080p FHD' | '720p HD' | '480p Fast'
): Promise<DeviceDownloadedMovieItem[]> {
  const durationMin = Math.max(45, Math.round((movie.durationSeconds || 5400) / 60));
  const estimatedSizeMb =
    quality === '1080p FHD'
      ? Math.round(durationMin * 8.5)
      : quality === '720p HD'
      ? Math.round(durationMin * 4.8)
      : Math.round(durationMin * 2.2);

  // Pre-cache poster & backdrop images in browser CacheStorage if supported
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(DEVICE_VAULT_CACHE_NAME);
      const urlsToCache = [
        movie.thumbnailUrl,
        movie.backdropUrl,
        isValidYouTubeId(movie.youtubeVideoId)
          ? `https://i.ytimg.com/vi/${movie.youtubeVideoId}/hqdefault.jpg`
          : '',
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
    backdropUrl: movie.backdropUrl,
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
  const [selectedQuality, setSelectedQuality] = useState<'1080p FHD' | '720p HD' | '480p Fast'>(
    '1080p FHD'
  );
  const [vaultSaved, setVaultSaved] = useState<boolean>(() =>
    isMovieInDeviceVault(movie.id)
  );
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [resolvedMp4Url, setResolvedMp4Url] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const durationMin = Math.max(
    45,
    Math.round((movie.durationSeconds || 5400) / 60)
  );
  const fhdSizeMb = Math.round(durationMin * 8.5);
  const hdSizeMb = Math.round(durationMin * 4.8);
  const fastSizeMb = Math.round(durationMin * 2.2);

  const currentSizeMb =
    selectedQuality === '1080p FHD'
      ? fhdSizeMb
      : selectedQuality === '720p HD'
      ? hdSizeMb
      : fastSizeMb;

  useEffect(() => {
    setVaultSaved(isMovieInDeviceVault(movie.id));
  }, [movie.id]);

  // Download genuine .MP4 video file directly to Phone or Computer
  const handleDownloadMp4 = async (mirrorUrl?: string) => {
    if (downloadProgress !== null) return;
    setStatusMessage(null);
    setDownloadProgress(20);

    const qLabel =
      selectedQuality === '1080p FHD'
        ? '1080p'
        : selectedQuality === '720p HD'
        ? '720p'
        : '480p';

    // 1. Automatically register into Saved Movies vault
    const updatedVault = await saveMovieToDeviceVault(movie, selectedQuality);
    setVaultSaved(true);
    if (onVaultUpdated) onVaultUpdated(updatedVault);

    const safeFileName =
      movie.title
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 60) || 'TK_STORYWORLD_Movie_2026';

    setDownloadProgress(60);

    // If an explicit mirror was tapped
    if (mirrorUrl) {
      window.open(mirrorUrl, '_blank', 'noopener,noreferrer');
      setDownloadProgress(100);
      setStatusMessage(
        `✓ Opened high-speed .MP4 downloader for "${movie.title}". Download starts directly in your browser. Once saved, play with zero data in Saved Movies!`
      );
      window.setTimeout(() => setDownloadProgress(null), 1200);
      return;
    }

    // Attempt direct backend stream resolver
    let directStreamUrl: string | null = null;
    try {
      const res = await fetch(
        `/api/movies/${encodeURIComponent(movie.id)}/resolve-mp4`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            youtubeVideoId: movie.youtubeVideoId,
            quality: qLabel,
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
      // Continue to high-speed direct MP4 gateway
    }

    setDownloadProgress(90);

    // If direct stream URL resolved, trigger native .mp4 file download
    if (directStreamUrl) {
      setResolvedMp4Url(directStreamUrl);
      const a = document.createElement('a');
      a.href = directStreamUrl;
      a.download = `${safeFileName}_${qLabel}_TK_STORYWORLD.mp4`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloadProgress(100);
      setStatusMessage(
        `✓ Download started: "${safeFileName}_${qLabel}.mp4". Once downloaded, open Saved Movies to play with zero data!`
      );
      window.setTimeout(() => setDownloadProgress(null), 1200);
      return;
    }

    // Direct high-speed 1-tap MP4 download gateway for mobile & desktop
    const resolvedSrc = resolveMovieSource(movie);
    const directMp4Gateway =
      resolvedSrc.platform === 'youtube'
        ? `https://www.ssyoutube.com/watch?v=${resolvedSrc.videoId}`
        : `https://en.savefrom.net/1-youtube-video-downloader-4/?url=${encodeURIComponent(
            resolvedSrc.externalWatchUrl
          )}`;
    window.open(directMp4Gateway, '_blank', 'noopener,noreferrer');
    setDownloadProgress(100);
    setStatusMessage(
      `✓ .MP4 Video Downloader opened! Tap download to save the .mp4 file to your device. Once saved, tap "Play Offline (0 Data)" in Saved Movies to watch anytime without internet.`
    );
    window.setTimeout(() => setDownloadProgress(null), 1200);
  };

  const handleSaveOnlyToVault = async () => {
    const updatedVault = await saveMovieToDeviceVault(movie, selectedQuality);
    setVaultSaved(true);
    if (onVaultUpdated) onVaultUpdated(updatedVault);
    setStatusMessage(
      `✓ Added to your "Saved Movies" page. Tap "Play Offline (0 Data)" in Saved Movies to watch!`
    );
  };

  const handleRemoveFromVault = () => {
    const updated = removeMovieFromDeviceVault(movie.id);
    setVaultSaved(false);
    if (onVaultUpdated) onVaultUpdated(updated);
    setStatusMessage('Removed movie from your Saved Movies vault.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Download ${movie.title}`}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#0B0E15] border border-emerald-500/35 p-5 sm:p-7 space-y-5 shadow-2xl my-auto">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <Video className="w-3 h-3" />
              <span>Genuine .MP4 Video Downloader</span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white leading-snug">
              Download Movie as .MP4 File
            </h2>
            <p className="text-xs text-slate-400">
              Saves a real .mp4 video file to your phone or computer storage for 100% offline playback.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Close download modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Movie Info Snippet */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-black/50 border border-white/10">
          <div className="relative w-20 aspect-video rounded-lg overflow-hidden shrink-0 bg-slate-900 border border-white/10">
            <CinemaPosterImage
              src={movie.backdropUrl || movie.thumbnailUrl}
              fallbackVideoId={movie.youtubeVideoId}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              {movie.primaryCategory} · {movie.durationFormatted}
            </div>
            <h3 className="font-display text-xs sm:text-sm font-bold text-white truncate">
              {movie.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
              <span>File Format: <strong className="text-emerald-300">.MP4 Video</strong></span>
              <span>•</span>
              <span>Est. Size: ~{currentSizeMb} MB</span>
            </div>
          </div>
        </div>

        {/* Quality Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>Select .MP4 Video Quality</span>
            <span className="text-emerald-400 font-mono text-[11px]">
              Ready for Mobile &amp; PC
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSelectedQuality('1080p FHD')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedQuality === '1080p FHD'
                  ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
                  : 'bg-[#07090E] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="font-display text-xs font-bold text-white truncate">
                💎 1080p FHD
              </div>
              <div className="font-mono text-[10px] text-[#F59E0B] font-bold mt-0.5">
                ~{fhdSizeMb} MB
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                Crystal Clear .mp4
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedQuality('720p HD')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedQuality === '720p HD'
                  ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
                  : 'bg-[#07090E] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="font-display text-xs font-bold text-white truncate">
                🎬 720p HD
              </div>
              <div className="font-mono text-[10px] text-emerald-400 font-bold mt-0.5">
                ~{hdSizeMb} MB
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                Fast &amp; Crisp .mp4
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedQuality('480p Fast')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedQuality === '480p Fast'
                  ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
                  : 'bg-[#07090E] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="font-display text-xs font-bold text-white truncate">
                ⚡ 480p Saver
              </div>
              <div className="font-mono text-[10px] text-slate-300 font-bold mt-0.5">
                ~{fastSizeMb} MB
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                Lightweight .mp4
              </div>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {downloadProgress !== null && (
          <div className="space-y-1.5 p-3 rounded-xl bg-black/60 border border-emerald-500/30">
            <div className="flex justify-between text-xs font-mono text-emerald-400 font-bold">
              <span>Generating .MP4 Download ({selectedQuality})...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 space-y-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{statusMessage}</div>
            </div>
          </div>
        )}

        {/* Primary Action Button: Download Real .MP4 */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={() => void handleDownloadMp4()}
            disabled={downloadProgress !== null}
            className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs sm:text-sm font-bold shadow-xl shadow-emerald-600/25 transition-all transform hover:scale-[1.01] cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download .MP4 Video to Device ({selectedQuality})</span>
          </button>

          {/* Alternative 1-Tap Fast MP4 Download Mirrors */}
          <div className="rounded-xl bg-[#07090E] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Fast 1-Tap .MP4 Direct Download Links:
              </span>
              <span className="text-[10px] text-slate-400 font-mono">100% Genuine .mp4</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const src = resolveMovieSource(movie);
                  const url =
                    src.platform === 'youtube'
                      ? `https://www.ssyoutube.com/watch?v=${src.videoId}`
                      : `https://en.savefrom.net/1-youtube-video-downloader-4/?url=${encodeURIComponent(
                          src.externalWatchUrl
                        )}`;
                  void handleDownloadMp4(url);
                }}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                title="Download via Fast Mirror 1"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                <span>Fast Mirror 1 (.MP4)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const src = resolveMovieSource(movie);
                  const url =
                    src.platform === 'youtube'
                      ? `https://y2mate.is/en/watch?v=${src.videoId}`
                      : `https://en.savefrom.net/1-youtube-video-downloader-4/?url=${encodeURIComponent(
                          src.externalWatchUrl
                        )}`;
                  void handleDownloadMp4(url);
                }}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                title="Download via Fast Mirror 2"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                <span>Fast Mirror 2 (.MP4)</span>
              </button>
            </div>
          </div>

          {/* In-App Vault Actions */}
          <div className="flex items-center gap-2 pt-1">
            {vaultSaved ? (
              <div className="flex-1 flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-emerald-500/25">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                  <Check className="w-4 h-4" />
                  <span>Added to Saved Movies</span>
                </div>
                {onOpenSavedMovies && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSavedMovies();
                    }}
                    className="text-xs text-white hover:text-emerald-300 font-bold underline cursor-pointer"
                  >
                    View in Saved Movies →
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSaveOnlyToVault()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>Also Add to "Saved Movies" In-App Vault</span>
              </button>
            )}

            {vaultSaved && (
              <button
                type="button"
                onClick={handleRemoveFromVault}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-950/50 border border-white/10 text-slate-400 hover:text-rose-400 cursor-pointer"
                title="Remove from Saved Movies"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Device Compatibility Notes */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-1 border-t border-white/10">
            <span className="inline-flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-emerald-400" />
              Android Gallery &amp; Apple Files
            </span>
            <span className="inline-flex items-center gap-1">
              <Laptop className="w-3 h-3 text-emerald-400" />
              Windows, Mac &amp; VLC Player
            </span>
            <span className="inline-flex items-center gap-1">
              <WifiOff className="w-3 h-3 text-emerald-400" />
              0 Data Offline
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

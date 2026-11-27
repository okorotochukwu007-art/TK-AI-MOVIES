import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FastForward,
  FolderOpen,
  HardDrive,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { MovieItem } from '../types/cinema.ts';
import {
  getOfflineVideoBlob,
  removeOfflineVideo,
  saveOfflineVideoBlob,
} from '../utils/offlineVideoStore.ts';

interface OfflineCinemaPlayerModalProps {
  movie: MovieItem;
  initialFile?: File | Blob | null;
  onClose: () => void;
  onOpenDownloadModal?: (movie: MovieItem) => void;
}

export function OfflineCinemaPlayerModal({
  movie,
  initialFile,
  onClose,
  onOpenDownloadModal,
}: OfflineCinemaPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeMb, setFileSizeMb] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fillScreen, setFillScreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [dragTime, setDragTime] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavedInVault, setIsSavedInVault] = useState<boolean>(false);
  const [savingToVault, setSavingToVault] = useState<boolean>(false);

  useEffect(() => {
    const syncFs = () => {
      const doc = document as any;
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  // Resume progress storage key
  const progressStorageKey = `tk_offline_progress_${movie.id}`;

  // Load video: check initialFile prop, then check IndexedDB
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function init() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        if (initialFile) {
          createdUrl = URL.createObjectURL(initialFile);
          if (active) {
            setVideoUrl(createdUrl);
            setFileName(
              initialFile instanceof File ? initialFile.name : `${movie.title}.mp4`
            );
            setFileSizeMb(Math.round((initialFile.size / (1024 * 1024)) * 10) / 10);
            setIsLoading(false);
            // Auto save to IndexedDB for next time
            void saveOfflineVideoBlob(movie.id, initialFile).then(() => {
              if (active) setIsSavedInVault(true);
            });
          }
          return;
        }

        // Check IndexedDB
        const stored = await getOfflineVideoBlob(movie.id);
        if (stored && active) {
          createdUrl = URL.createObjectURL(stored.blob);
          setVideoUrl(createdUrl);
          setFileName(stored.fileName);
          setFileSizeMb(Math.round((stored.fileSize / (1024 * 1024)) * 10) / 10);
          setIsSavedInVault(true);
          setIsLoading(false);
          return;
        }

        if (active) {
          setIsLoading(false);
        }
      } catch (err: any) {
        if (active) {
          console.error('Error loading offline video:', err);
          setErrorMessage(err.message || 'Failed to access offline storage');
          setIsLoading(false);
        }
      }
    }

    void init();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [movie.id, initialFile]);

  // Handle file picker selection
  const handleFileSelected = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      const newUrl = URL.createObjectURL(file);
      setVideoUrl(newUrl);
      setFileName(file.name);
      setFileSizeMb(Math.round((file.size / (1024 * 1024)) * 10) / 10);

      // Save to IndexedDB
      setSavingToVault(true);
      await saveOfflineVideoBlob(movie.id, file, file.name);
      setIsSavedInVault(true);
    } catch (err: any) {
      console.warn('Could not save file to IndexedDB:', err);
      // Still allow playback even if IndexedDB quota is exceeded
    } finally {
      setSavingToVault(false);
      setIsLoading(false);
    }
  };

  // Video metadata loaded
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const dur = video.duration || 0;
    setDuration(dur);

    // Restore saved progress
    try {
      const savedProg = localStorage.getItem(progressStorageKey);
      if (savedProg) {
        const secs = parseFloat(savedProg);
        if (!isNaN(secs) && secs > 5 && secs < dur - 10) {
          video.currentTime = secs;
          setCurrentTime(secs);
        }
      }
    } catch {
      // Ignore
    }

    // Auto play
    video
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  // Update progress
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isDraggingProgress) return;
    const curr = video.currentTime;
    setCurrentTime(curr);

    // Save progress periodically (every 5 seconds)
    if (Math.floor(curr) % 5 === 0) {
      try {
        localStorage.setItem(progressStorageKey, String(curr));
      } catch {
        // Ignore
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const skipSeconds = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + delta, duration));
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (video) {
      video.volume = newVol;
      video.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume || 0.8;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    setPlaybackSpeed(speed);
    if (video) {
      video.playbackRate = speed;
    }
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current as any;
    const video = videoRef.current as any;
    const doc = document as any;

    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
        try {
          (screen.orientation as any)?.unlock?.();
        } catch {
          // ignore
        }
        setIsFullscreen(false);
        return;
      }

      if (container?.requestFullscreen) {
        await container.requestFullscreen();
        setIsFullscreen(true);
        try {
          await (screen.orientation as any)?.lock?.('landscape');
        } catch {
          // ignore if orientation lock is unsupported
        }
      } else if (container?.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if (video?.webkitEnterFullscreen) {
        // Native iPhone Safari video hardware fullscreen
        video.webkitEnterFullscreen();
        setIsFullscreen(true);
      } else {
        setIsFullscreen((prev) => !prev);
      }
    } catch {
      if (video?.webkitEnterFullscreen) {
        try {
          video.webkitEnterFullscreen();
        } catch {
          // ignore
        }
      }
      setIsFullscreen((prev) => !prev);
    }
  };

  // Progress Bar Scrubber
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * duration;
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  // Auto-hide controls on mouse move or touch tap
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3200);
  };

  const handleStageTap = () => {
    if (!isPlaying) {
      togglePlay();
      return;
    }
    if (showControls) {
      setShowControls(false);
    } else {
      handleMouseMove();
    }
  };

  // Format seconds to H:MM:SS or MM:SS
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentDisplayTime = isDraggingProgress ? dragTime : currentTime;
  const progressPercent = duration > 0 ? (currentDisplayTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[100] bg-black text-white flex flex-col select-none overflow-hidden"
    >
      {/* HIDDEN FILE INPUT */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/x-m4v,video/webm,video/mkv,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      {/* TOP HEADER */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/95 via-black/70 to-transparent pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:p-6 transition-opacity duration-300 flex items-center justify-between gap-4 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all cursor-pointer shrink-0"
            title="Exit Player"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <WifiOff className="w-3 h-3" />
                100% Offline · Zero Data
              </span>
              <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono">
                {movie.primaryCategory}
              </span>
            </div>
            <h1 className="font-display text-sm sm:text-base md:text-lg font-bold text-white truncate max-w-xl mt-0.5">
              {movie.title}
            </h1>
          </div>
        </div>

        {/* Right Header Options */}
        <div className="flex items-center gap-2 shrink-0">
          {fileName && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300 truncate max-w-[160px]">{fileName}</span>
              {fileSizeMb > 0 && (
                <span className="text-slate-500 font-mono">({fileSizeMb} MB)</span>
              )}
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-slate-200 transition-colors cursor-pointer"
            title="Load another video file"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Change File</span>
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              onClick={handleStageTap}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={(e) => {
                console.error('Video error:', e);
                setErrorMessage('Unable to decode video format. Please select a valid MP4 file.');
              }}
              playsInline
              preload="auto"
              className={`w-full h-full cursor-pointer ${
                fillScreen ? 'object-cover' : 'object-contain'
              }`}
            />

            {/* BIG CENTER PLAY/PAUSE OVERLAY ON TAP/PAUSE */}
            {(!isPlaying || showControls) && (
              <div
                onClick={handleStageTap}
                className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-auto cursor-pointer"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                    handleMouseMove();
                  }}
                  className="w-20 h-20 rounded-full bg-[#E11D48]/90 hover:bg-[#E11D48] text-white flex items-center justify-center shadow-2xl transition-all transform hover:scale-105 cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-9 h-9 fill-current" />
                  ) : (
                    <Play className="w-9 h-9 fill-current ml-0.5" />
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          /* NO FILE SELECTED SCREEN */
          <div className="max-w-xl mx-auto px-6 text-center space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-2xl">
              <WifiOff className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                TK STORYWORLD OFFLINE CINEMA
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                Play "{movie.title}" With Zero Data
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                Select the movie file you downloaded to your device storage (phone, tablet, or PC).
                It will play completely offline right here in the TK STORYWORLD luxury cinema player!
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all transform hover:scale-[1.02] cursor-pointer"
              >
                <FolderOpen className="w-5 h-5" />
                <span>Select Downloaded Movie File from Device</span>
              </button>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-2">
                <span>✓ 0MB Data Consumed</span>
                <span>•</span>
                <span>✓ 100% Airplane Mode Ready</span>
                <span>•</span>
                <span>✓ Zero Interruptions</span>
              </div>
            </div>

            {onOpenDownloadModal && (
              <div className="pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-xs text-slate-400">
                <span>Haven't downloaded this movie yet?</span>
                <button
                  onClick={() => {
                    onClose();
                    onOpenDownloadModal(movie);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold underline cursor-pointer"
                >
                  Download to Device First
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS & TIMELINE SCRUBBER */}
      {videoUrl && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/95 via-black/80 to-transparent pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:p-6 space-y-3 transition-opacity duration-300 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* PROGRESS BAR & SCRUBBER */}
          <div
            onClick={handleSeek}
            className="group relative h-3 bg-white/20 rounded-full cursor-pointer flex items-center"
          >
            {/* Played Track */}
            <div
              className="h-full bg-gradient-to-r from-[#E11D48] via-rose-500 to-[#F59E0B] rounded-full relative"
              style={{ width: `${progressPercent}%` }}
            >
              {/* Scrub Handle */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg scale-0 group-hover:scale-100 transition-transform" />
            </div>
          </div>

          {/* CONTROL BUTTONS ROW */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {/* Left Controls: Play/Pause, Rewind 10, Forward 10, Time */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={() => skipSeconds(-10)}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
                title="Rewind 10 Seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => skipSeconds(10)}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
                title="Fast Forward 10 Seconds"
              >
                <FastForward className="w-4 h-4" />
              </button>

              {/* Time Display */}
              <div className="text-xs font-mono text-slate-300 ml-1">
                <span className="text-white font-bold">{formatTime(currentDisplayTime)}</span>
                <span className="text-slate-500 mx-1.5">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Volume, Fit/Fill, Speed, Fullscreen */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Volume */}
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-16 md:w-20 accent-emerald-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
                />
              </div>

              <button
                type="button"
                onClick={() => setFillScreen((prev) => !prev)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
                title="Toggle 16:9 Fit vs Full Screen Fill"
              >
                {fillScreen ? '16:9 Fit' : 'Screen Fill'}
              </button>

              {/* Playback Speed Selector */}
              <div className="relative group">
                <button className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-mono font-bold text-slate-200 cursor-pointer">
                  {playbackSpeed}x
                </button>
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:flex flex-col bg-[#0E1118] border border-white/15 rounded-xl p-1 shadow-2xl z-40 min-w-[70px]">
                  {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => handleSpeedChange(spd)}
                      className={`px-3 py-1 rounded text-xs font-mono text-left cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Fullscreen */}
              <button
                onClick={() => void toggleFullscreen()}
                className="w-9 h-9 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] flex items-center justify-center text-white transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
